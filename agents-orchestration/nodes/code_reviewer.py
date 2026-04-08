from __future__ import annotations

import json
import re
from textwrap import dedent
from typing import Any

from graph.state import SentinelState
from llm.client import get_healer_llm, get_provider, is_real_only_mode

REVIEWER_SYSTEM_PROMPT = dedent(
    """
    You are TollGate's senior **full-stack code review** agent. Sentinel-style tools
    only fix tests; TollGate must review the **entire PR** like a staff engineer.

    Examine **all** changed code for:

    1. **Security** — XSS (unsafe DOM, unsanitized HTML), injection patterns, secrets or
       tokens in source, `dangerouslySetInnerHTML` without sanitization, weak client-side
       auth assumptions, unsafe `eval` / dynamic code, sensitive data in logs, obvious
       authz gaps in API routes when visible.

    2. **Performance** — avoidable re-renders, heavy work in render without memoization,
       missing dependency arrays / incorrect `useEffect` deps, loading entire lists
       without virtualization when clearly large, N+1-style data fetching patterns
       visible in the diff.

    3. **Maintainability & practices TypeScript/React** — weak typing, `any` abuse,
       inconsistent error handling, dead code, hooks rule violations, unclear naming,
       components that should be split, magic strings.

    4. **Reliability & robustness** — missing null/undefined checks, unhandled promise
       rejections, race conditions in effects, missing error UI.

    5. **Accessibility (a11y)** — missing labels, icon-only buttons without aria,
       poor heading order, non-semantic interactive elements when easily fixable.

    Output **strict JSON** with exactly these keys:
    - review_report_md: string (GitHub-flavored markdown). Must include sections with
      headings `### Security`, `### Performance`, `### Maintainability & practices`,
      `### Reliability`, `### Accessibility`. Under each, use bullets for findings. Be
      specific (file paths, patterns). Explain **what the agent changed** vs **recommended
      manually** at the end under `### Changes applied by TollGate`.
    - findings: array of objects with keys:
        category (one of: security, performance, maintainability, reliability, accessibility),
        severity (one of: critical, high, medium, low, info),
        file (string or null),
        title (short string),
        detail (string),
        fix_applied_in_edit (boolean)
    - file_edits: array of { "file", "search", "replace" } — same contract as the Healer:
        "file" repo-relative forward slashes; "search" MUST be copied verbatim from the
        "CURRENT FILES ON PR BRANCH" blocks in the user message when those are present;
        "replace" is the full corrected snippet. Only include edits you are confident are safe.
        **Multiple files**: fix every issue you can safely patch across the PR, not only one file.
    - confidence_score: float 0.0–1.0 for overall quality of this review output.

    Rules:
    - Never edit lockfiles (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`), minified
      assets, or binary paths.
    file_edits must only touch paths listed under changed files / current file snapshots.
    - If you cannot produce an exact `search` string from the snapshots, omit that edit
      and document the recommendation in review_report_md only.
    - Prefer small, reviewable hunks (short `search` anchors, 1–15 lines).
    """
).strip()


def _normalize_rel_path(path: str) -> str:
    return path.strip().replace("\\", "/").lstrip("./")


def _load_json_payload(content: str) -> dict[str, Any]:
    text = content.strip()
    if not text:
        raise ValueError("Code reviewer returned an empty response")
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass
    fenced_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL | re.IGNORECASE)
    if fenced_match:
        parsed = json.loads(fenced_match.group(1))
        if isinstance(parsed, dict):
            return parsed
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        parsed = json.loads(text[start : end + 1])
        if isinstance(parsed, dict):
            return parsed
    raise ValueError("Code reviewer response did not contain a valid JSON object")


def _parse_response(
    content: str, allowed_files: list[str] | None = None
) -> dict[str, object]:
    payload = _load_json_payload(content)
    review_report_md = str(payload.get("review_report_md", "")).strip()
    confidence_score = max(0.0, min(1.0, float(payload.get("confidence_score", 0.0))))

    raw_findings = payload.get("findings", [])
    findings: list[dict[str, Any]] = []
    if isinstance(raw_findings, list):
        for item in raw_findings:
            if isinstance(item, dict):
                findings.append(dict(item))

    raw_allowed = [
        _normalize_rel_path(str(f)) for f in (allowed_files or []) if str(f).strip()
    ]
    allowed_norm = set(raw_allowed) if raw_allowed else None

    raw_file_edits = payload.get("file_edits", [])
    file_edits: list[dict[str, str]] = []
    skip_basenames = {
        "package-lock.json",
        "yarn.lock",
        "pnpm-lock.yaml",
        "npm-shrinkwrap.json",
        "bun.lockb",
    }

    def _skip_path(path: str) -> bool:
        base = path.split("/")[-1].lower()
        if base in skip_basenames:
            return True
        if base.endswith(".min.js") or base.endswith(".min.css"):
            return True
        return False

    if isinstance(raw_file_edits, list):
        for edit in raw_file_edits:
            if not isinstance(edit, dict) or not edit.get("file") or not edit.get("search"):
                continue
            if "replace" not in edit:
                continue
            fn = _normalize_rel_path(str(edit["file"]))
            if _skip_path(fn) or fn.split("/")[-1].startswith("."):
                continue
            if allowed_norm is not None and fn not in allowed_norm:
                continue
            search = str(edit["search"])
            if "\u2026" in search or re.search(
                r"[A-Za-z0-9_=/-]\.{3}(\s|$|\"|'|`|>|<)", search
            ):
                continue
            file_edits.append({
                "file": fn,
                "search": search,
                "replace": str(edit["replace"]),
            })

    if not review_report_md:
        review_report_md = (
            "## TollGate code review\n\n"
            "_No narrative report was returned; see findings and file edits below._"
        )

    return {
        "review_report_md": review_report_md,
        "findings": findings,
        "file_edits": file_edits,
        "review_confidence_score": confidence_score,
    }


def _mock_code_reviewer(state: SentinelState) -> dict[str, object]:
    return {
        "review_report_md": (
            "## TollGate code review (mock)\n\n"
            "_LLM not configured — enable OPENAI_API_KEY / ANTHROPIC_API_KEY for a full review._"
        ),
        "findings": [],
        "file_edits": [],
        "review_confidence_score": 0.0,
    }


def code_reviewer_node(state: SentinelState) -> dict[str, object]:
    if state.get("force_mock"):
        return _mock_code_reviewer(state)

    llm = get_healer_llm()
    provider = get_provider()
    if llm is None:
        if is_real_only_mode():
            raise RuntimeError(
                f"Code reviewer requires a live LLM, but no API key is configured "
                f"for provider '{provider}'"
            )
        return _mock_code_reviewer(state)

    all_changed = list(state.get("changed_files", []) or [])
    git_diff = str(state.get("git_diff", "") or "")
    snapshot_section = ""
    raw_snaps = state.get("pr_head_file_contents")
    if isinstance(raw_snaps, list) and raw_snaps:
        blocks: list[str] = []
        for item in raw_snaps[:30]:
            if not isinstance(item, dict):
                continue
            p = str(item.get("path", "")).strip()
            c = str(item.get("content", ""))
            if not p or not c:
                continue
            ext = p.rsplit(".", 1)[-1].lower() if "." in p else ""
            lang = {"tsx": "tsx", "jsx": "jsx", "ts": "ts", "js": "js", "json": "json"}.get(ext, "")
            fence = f"```{lang}" if lang else "```"
            blocks.append(f"### FILE: {p}\n{fence}\n{c}\n```")
        if blocks:
            snapshot_section = (
                "\n\nCURRENT FILES ON PR BRANCH (verbatim — use for file_edits.search):\n\n"
                + "\n\n".join(blocks)
            )

    user_prompt = dedent(
        f"""
        Repository: {state.get("repo_url", "")}
        Target / deploy URL (context only): {state.get("target_url", "")}
        Branch ref: {state.get("branch", "")}

        **All changed files in this PR:** {all_changed}

        **Full PR diff (may be truncated):**
        ```
        {git_diff[:28000] if len(git_diff) > 28000 else git_diff}
        ```
        {snapshot_section}

        Produce the JSON object described in your instructions. Address **every** changed
        file you can meaningfully assess. Prefer applying **concrete** `file_edits` for
        clear wins (security, obvious perf, broken a11y). Return strict JSON only.
        """
    ).strip()

    try:
        response = llm.invoke(
            [
                {"role": "system", "content": REVIEWER_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ]
        )
        content = response.content if isinstance(response.content, str) else str(response.content)
        return _parse_response(content, allowed_files=all_changed)
    except Exception as err:
        if is_real_only_mode():
            raise RuntimeError(
                f"Code reviewer LLM call failed for provider '{provider}': {err.__class__.__name__}"
            ) from err
        mock = _mock_code_reviewer(state)
        mock["review_report_md"] = (
            str(mock.get("review_report_md", ""))
            + f"\n\n_Fallback: reviewer LLM error ({err.__class__.__name__})._"
        )
        return mock
