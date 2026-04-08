from __future__ import annotations

import json
import re
from textwrap import dedent
from typing import Any

from graph.state import SentinelState
from llm.client import get_healer_llm, get_provider, is_real_only_mode
from memory.retriever import get_similar_past_fixes

HEALER_SYSTEM_PROMPT = dedent(
    """
    You are a senior software debugging agent for TollGate.
    You will receive:
    1. Failed browser test outputs (these are E2E tests run in a real browser)
    2. Recent code-change history (a git diff showing what CHANGED recently)
    3. Accessibility snapshots of the UI at the time of failure

    Output strict JSON with these keys:
    - rca_type: one of selector_mismatch, ui_regression, timing_issue, test_logic_bug, backend_error, unknown
    - rca_report: string explaining the root cause
    - proposed_fix: string describing the fix in plain English
    - file_edits: array of search/replace edits (see below)
    - proposed_patch: a unified diff summary for display purposes
    - target_files: array of file paths being fixed
    - fix_branch: short git branch name (e.g. fix/revert-dashboard-text)
    - confidence_score: float from 0.0 to 1.0

    FILE TARGETING — CRITICAL:
    - The test failures come from BROWSER tests that interact with the UI.
    - For ui_regression / selector_mismatch: target ONLY frontend files
      (.tsx, .jsx, .ts, .js, .css in src/app/, src/components/, src/pages/).
      NEVER target Python files, config files, or backend infrastructure.
    - target_files must ONLY contain files from the "Changed files" list.
    - If the test asserts "page contains X" and X is missing, fix the source
      file that renders that page.

    FILE EDITS — THIS IS HOW YOUR FIX GETS APPLIED (AUTOMATION USES LITERAL MATCH):
    - file_edits: array of objects, each with exactly:
        { "file": "<path>", "search": "<snippet>", "replace": "<snippet>" }
    - "file" MUST be one of the paths listed under "Frontend files" / changed files
      in the user message (repo-relative, use forward slashes e.g. src/app/page.tsx).
      NEVER invent paths like src/pages/X if the repo uses src/app/ (Next.js App Router).
    - "search" MUST be copied verbatim from the Git diff shown above:
      copy the exact lines as they appear in the patch for that file (the current
      post-change code — usually what appears after '+' or in the post-image of the hunk).
      Do NOT paraphrase, summarize, abbreviate, or use "..." placeholders.
      Do NOT copy from memory, RAG samples, or guesses — only from this diff.
    - Prefer a SHORT anchor (1–5 lines) that is still unique in that file: a single
      JSX tag with stable attributes, or a small block including data-testid / className.
    - "replace" is the corrected text (often the pre-regression lines from '-' in the
      same hunk). Same rules: verbatim, no truncation.
    - Multiple edits: order from top to bottom of file when possible.
    - proposed_patch is for humans in the PR body only; it does not need to apply cleanly.
    - If you cannot copy an exact snippet from the diff for a file, set file_edits to []
      and lower confidence_score (do not hallucinate search text).

    MULTI-FILE / SYNTAX REGRESSIONS:
    - PRs may break several UI files at once (e.g. unclosed JSX tags in Header.tsx AND
      malformed markup in Dashboard.tsx). You MUST fix every changed frontend file that
      still has syntax or JSX structure errors—not only the first failure.
    - target_files must list every file you modify. Prefer multiple file_edits (one or
      more per file) until all broken files in scope are repaired.

    WHEN "CURRENT FILES ON PR BRANCH" IS PRESENT IN THE USER MESSAGE:
    - Those blocks are verbatim text from GitHub for each path. For file_edits on that
      path, the "search" string MUST be copied exactly from that block (contiguous
      substring). Do not use the diff alone for search text when snapshots exist.
    """
).strip()


def _filter_diff_to_files(full_diff: str, target_files: list[str]) -> str:
    """Extract only the diff sections for the specified files."""
    if not full_diff or not target_files:
        return full_diff
    sections = re.split(r'(?=^diff --git )', full_diff, flags=re.MULTILINE)
    kept: list[str] = []
    for section in sections:
        if not section.strip():
            continue
        for f in target_files:
            if f in section:
                kept.append(section)
                break
    return "\n".join(kept) if kept else full_diff


def _failed_results(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [item for item in results if item.get("status") in {"failed", "skipped"}]


def _validate_input(state: SentinelState) -> list[dict[str, Any]]:
    results = state.get("test_results")
    if results is None:
        raise ValueError("state.test_results is required before healer step")
    if not isinstance(results, list):
        raise ValueError("state.test_results must be a list")
    failures = _failed_results(results)
    if not failures:
        raise ValueError("healer step requires at least one failed or skipped result")
    return failures


def _failure_context(failures: list[dict[str, Any]]) -> str:
    chunks: list[str] = []
    for idx, item in enumerate(failures[:3], start=1):
        snapshot = str(item.get("accessibility_snapshot", "")).strip()
        if len(snapshot) > 800:
            snapshot = snapshot[:800] + "...[truncated]"
        chunks.append(
            dedent(
                f"""
                Failure {idx}
                - test_step: {item.get("name", "")}
                - status: {item.get("status", "")}
                - error: {item.get("error", "")}
                - selector_or_target: {item.get("target", "unknown")}
                - browser_state_snapshot:
                {snapshot or "N/A"}
                """
            ).strip()
        )
    return "\n\n".join(chunks)


def _mock_healer(state: SentinelState, failures: list[dict[str, Any]]) -> dict[str, object]:
    first = failures[0]
    step_name = str(first.get("name", "Unknown step"))
    error_text = str(first.get("error", "")).lower()
    changed_files = state.get("changed_files", [])
    primary_file = str(changed_files[0]) if changed_files else ""

    if "timed out" in error_text:
        return {
            "rca_type": "timing_issue",
            "rca_report": (
                f"The failure in '{step_name}' most likely comes from page readiness timing. "
                "The UI appears to load, but the step timed out before the expected state was confirmed."
            ),
            "proposed_fix": (
                "Increase timeouts for first-load navigation and make assertions target stable, visible text or form labels."
            ),
            "proposed_patch": "",
            "file_edits": [],
            "fix_branch": "fix/timing-timeouts",
            "target_files": [primary_file] if primary_file else [],
            "confidence_score": 0.82,
        }

    return {
        "rca_type": "test_logic_bug",
        "rca_report": (
            f"The failure in '{step_name}' most likely comes from a mismatch between the generated test plan "
            "and the actual UI state after recent changes."
        ),
        "proposed_fix": (
            "Review the failed step against the accessibility snapshot and rewrite the scenario with more explicit "
            "navigation and assertion language."
        ),
        "proposed_patch": "",
        "file_edits": [],
        "fix_branch": "",
        "target_files": [primary_file] if primary_file else [],
        "confidence_score": 0.68,
    }


def _normalize_rel_path(path: str) -> str:
    return path.strip().replace("\\", "/").lstrip("./")


def _parse_response(content: str, allowed_files: list[str] | None = None) -> dict[str, object]:
    payload = _load_json_payload(content)
    rca_type = str(payload["rca_type"]).strip()
    rca_report = str(payload["rca_report"]).strip()
    proposed_fix = str(payload["proposed_fix"]).strip()
    proposed_patch = str(payload.get("proposed_patch", "")).strip()
    fix_branch = str(payload.get("fix_branch", "")).strip()
    raw_target_files = payload.get("target_files", [])
    confidence_score = max(0.0, min(1.0, float(payload["confidence_score"])))
    if not isinstance(raw_target_files, list):
        raise ValueError("Healer response must include target_files as a JSON array")
    target_files = [str(item).strip() for item in raw_target_files if str(item).strip()]

    raw_file_edits = payload.get("file_edits", [])
    file_edits: list[dict[str, str]] = []
    raw_allowed = [
        _normalize_rel_path(str(f)) for f in (allowed_files or []) if str(f).strip()
    ]
    allowed_norm = set(raw_allowed) if raw_allowed else None
    if isinstance(raw_file_edits, list):
        for edit in raw_file_edits:
            if isinstance(edit, dict) and edit.get("file") and edit.get("search") and "replace" in edit:
                fn = _normalize_rel_path(str(edit["file"]))
                if allowed_norm is not None and fn not in allowed_norm:
                    continue
                search = str(edit["search"])
                # Drop obvious placeholder truncation (typed "..." summary, not JS spread)
                if "\u2026" in search or re.search(
                    r"[A-Za-z0-9_=/-]\.{3}(\s|$|\"|'|`|>|<)", search
                ):
                    continue
                file_edits.append({
                    "file": fn,
                    "search": search,
                    "replace": str(edit["replace"]),
                })

    allowed_types = {
        "selector_mismatch",
        "ui_regression",
        "timing_issue",
        "test_logic_bug",
        "backend_error",
        "unknown",
    }
    if rca_type not in allowed_types:
        raise ValueError(f"Unsupported rca_type '{rca_type}' returned by healer")
    if not rca_report or not proposed_fix:
        raise ValueError("Healer response must include non-empty rca_report and proposed_fix")
    return {
        "rca_type": rca_type,
        "rca_report": rca_report,
        "proposed_fix": proposed_fix,
        "proposed_patch": proposed_patch,
        "file_edits": file_edits,
        "fix_branch": fix_branch,
        "target_files": target_files,
        "confidence_score": confidence_score,
    }


def _load_json_payload(content: str) -> dict[str, Any]:
    text = content.strip()
    if not text:
        raise ValueError("Healer returned an empty response")

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

    raise ValueError("Healer response did not contain a valid JSON object")


def healer_node(state: SentinelState) -> dict[str, object]:
    failures = _validate_input(state)

    if state.get("force_mock"):
        return _mock_healer(state, failures)

    llm = get_healer_llm()
    provider = get_provider()
    if llm is None:
        if is_real_only_mode():
            raise RuntimeError(
                f"Healer requires a live LLM, but no API key is configured for provider '{provider}'"
            )
        return _mock_healer(state, failures)

    past_fixes = get_similar_past_fixes(
        git_diff=state.get('git_diff', ''),
        changed_files=state.get('changed_files', []),
        failed_tests=failures,
        top_k=3
    )

    rag_healer_matches = len(past_fixes)
    rag_healer_insights = ""

    memory_context = ""
    if past_fixes:
        rca_types_found = [f.get("rca_type", "unknown") for f in past_fixes if f.get("rca_type")]
        rag_healer_insights = (
            f"Found {rag_healer_matches} similar past fix(es) from RAG. "
            f"RCA types: {', '.join(rca_types_found) or 'N/A'}. "
            f"Using these insights to improve fix quality."
        )
        memory_context = "\nSimilar Past Fixes (from Vector DB):\n"
        for idx, fix in enumerate(past_fixes, 1):
            rca = fix.get("rca_report", "") or fix.get("rca_type", "N/A")
            resolution = fix.get("proposed_fix", "") or fix.get("proposed_patch", "N/A")
            edits = fix.get("file_edits", [])
            files = fix.get("target_files", [])
            memory_context += (
                f"--- Past Fix {idx} ---\n"
                f"Root Cause: {rca}\n"
                f"Resolution: {resolution}\n"
                f"Target Files: {files}\n"
            )
            if edits:
                memory_context += f"File Edits ({len(edits)} edits):\n"
                for e in edits[:3]:
                    fp = e.get("file") or e.get("file_path") or "?"
                    sv = (e.get("search", "") or "").strip()
                    rv = (e.get("replace", "") or "").strip()
                    memory_context += (
                        f"  File: {fp}\n"
                        f"  Search (verbatim): {sv[:600]}{'…[truncated]' if len(sv) > 600 else ''}\n"
                        f"  Replace (verbatim): {rv[:600]}{'…[truncated]' if len(rv) > 600 else ''}\n"
                    )
            memory_context += "\n"
    else:
        memory_context = "\nNo similar past fixes found in Vector DB."

    all_changed = state.get('changed_files', [])
    git_diff = state.get('git_diff', '')

    ui_extensions = {'.tsx', '.jsx', '.ts', '.js', '.css', '.scss', '.html'}
    ui_dirs = (
        'src/app/', 'src/components/', 'src/pages/', 'src/lib/',
        'app/', 'components/', 'pages/',
    )
    frontend_files = [
        f for f in all_changed
        if any(f.endswith(ext) for ext in ui_extensions)
        and (
            any(f.startswith(d) for d in ui_dirs)
            or f.startswith('src/')
        )
    ]

    filtered_diff = _filter_diff_to_files(git_diff, frontend_files) if frontend_files else git_diff
    if not filtered_diff.strip():
        filtered_diff = git_diff

    snapshot_section = ""
    raw_snaps = state.get("pr_head_file_contents")
    if isinstance(raw_snaps, list) and raw_snaps:
        blocks: list[str] = []
        for item in raw_snaps[:25]:
            if not isinstance(item, dict):
                continue
            p = str(item.get("path", "")).strip()
            c = str(item.get("content", ""))
            if not p or not c:
                continue
            ext = p.rsplit(".", 1)[-1].lower() if "." in p else ""
            lang = {"tsx": "tsx", "jsx": "jsx", "ts": "ts", "js": "js"}.get(ext, "")
            fence = f"```{lang}" if lang else "```"
            blocks.append(f"### FILE: {p}\n{fence}\n{c}\n```")
        if blocks:
            snapshot_section = (
                "\n\nCURRENT FILES ON PR BRANCH (verbatim from GitHub; use for file_edits "
                "search text, fix ALL broken files below):\n\n"
                + "\n\n".join(blocks)
            )

    search_instruction = (
        'For file_edits: every "search" string must appear EXACTLY in the CURRENT FILES '
        "section above (copy-paste only from those blocks)."
        if snapshot_section
        else (
            'For file_edits: every "search" string must appear EXACTLY in the current file '
            "content implied by the diff — copy-paste from the diff only, never invent text."
        )
    )

    user_prompt = dedent(
        f"""
        Repo: {state.get('repo_url', '')}
        Target URL: {state.get('target_url', '')}

        All changed files: {all_changed}
        Frontend files (most relevant for UI test failures): {frontend_files}

        Recent Git Diff (filtered to UI-relevant files):
        {filtered_diff[:15000] if len(filtered_diff) > 15000 else filtered_diff}
        {snapshot_section}

        Failed execution summary:
        {_failure_context(failures)}
        {memory_context}

        IMPORTANT: The tests run in a browser. If assertions like "page contains X"
        fail, the fix must target the frontend file that renders that page content.
        Only patch files from the "Frontend files" list above.

        {search_instruction}

        Return strict JSON only.
        """
    ).strip()

    rag_meta = {
        "rag_healer_matches": rag_healer_matches,
        "rag_healer_insights": rag_healer_insights,
    }

    try:
        response = llm.invoke(
            [
                {"role": "system", "content": HEALER_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ]
        )
        content = response.content if isinstance(response.content, str) else str(response.content)
        result = _parse_response(content, allowed_files=list(all_changed))
        result.update(rag_meta)
        return result
    except Exception as err:
        if is_real_only_mode():
            raise RuntimeError(
                f"Healer live LLM call failed for provider '{provider}': {err.__class__.__name__}"
            ) from err
        fallback = _mock_healer(state, failures)
        fallback["rca_report"] = (
            f"{fallback['rca_report']} Healer LLM fallback triggered for provider '{provider}': {err.__class__.__name__}."
        )
        fallback.update(rag_meta)
        return fallback
