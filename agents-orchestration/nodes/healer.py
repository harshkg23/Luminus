from __future__ import annotations

import json
import re
from textwrap import dedent
from typing import Any

from graph.state import SentinelState
from llm.client import get_healer_llm, get_provider, is_real_only_mode

HEALER_SYSTEM_PROMPT = dedent(
    """
    You are a senior software debugging agent for SentinelQA.
    You will receive:
    1. Failed browser test outputs
    2. Recent code-change context
    3. Accessibility snapshots of the UI

    Output strict JSON with these keys only:
    - rca_type
    - rca_report
    - proposed_fix
    - proposed_patch
    - target_files
    - fix_branch
    - confidence_score

    Rules:
    - Classify the failure into exactly one of:
      selector_mismatch, ui_regression, timing_issue, test_logic_bug, backend_error, unknown
    - confidence_score must be a float from 0.0 to 1.0
    - prefer the most likely root cause
    - identify whether this is most likely a test issue, UI regression, selector mismatch, timing issue, or backend problem
    - propose the smallest possible code or test change
    - proposed_patch must be a minimal unified diff when you can infer a concrete file-level fix
    - if you cannot infer a safe patch, set proposed_patch to an empty string
    - fix_branch must be a short, descriptive git branch name for the fix (e.g. fix/dashboard-selectors) if a patch is proposed, or empty otherwise
    - target_files must be a JSON array of the most relevant file paths to inspect or patch
    - use the failure output, snapshots, changed files, and repo information provided
    """
).strip()


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
            "proposed_patch": (
                f"--- a/{primary_file or 'tests/e2e/generated.spec.ts'}\n"
                f"+++ b/{primary_file or 'tests/e2e/generated.spec.ts'}\n"
                "@@ -1,1 +1,1 @@\n"
                "- await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });\n"
                "+ await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 60000 });\n"
            ),
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
        "fix_branch": "",
        "target_files": [primary_file] if primary_file else [],
        "confidence_score": 0.68,
    }


def _parse_response(content: str) -> dict[str, object]:
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

    user_prompt = dedent(
        f"""
        Repo: {state.get('repo_url', '')}
        Changed files: {state.get('changed_files', [])}
        Target URL: {state.get('target_url', '')}

        Recent Git Diff:
        {state.get('git_diff', 'No recent diff provided.')}

        Failed execution summary:
        {_failure_context(failures)}

        Return strict JSON only.
        """
    ).strip()

    try:
        response = llm.invoke(
            [
                {"role": "system", "content": HEALER_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ]
        )
        content = response.content if isinstance(response.content, str) else str(response.content)
        return _parse_response(content)
    except Exception as err:
        if is_real_only_mode():
            raise RuntimeError(
                f"Healer live LLM call failed for provider '{provider}': {err.__class__.__name__}"
            ) from err
        fallback = _mock_healer(state, failures)
        fallback["rca_report"] = (
            f"{fallback['rca_report']} Healer LLM fallback triggered for provider '{provider}': {err.__class__.__name__}."
        )
        return fallback
