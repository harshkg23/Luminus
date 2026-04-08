from __future__ import annotations

from graph.state import SentinelState

CONFIDENCE_THRESHOLD = 0.8


def courier_decision_node(state: SentinelState) -> dict[str, object]:
    confidence_score = state.get("confidence_score")
    if confidence_score is None:
        raise ValueError("state.confidence_score is required before courier decision step")

    rca_type = str(state.get("rca_type", "unknown")).strip() or "unknown"
    rca_report = str(state.get("rca_report", "")).strip()
    proposed_fix = str(state.get("proposed_fix", "")).strip()
    proposed_patch = str(state.get("proposed_patch", "")).strip()

    raw_target_files = state.get("target_files", [])
    if isinstance(raw_target_files, list):
        target_files_list = raw_target_files
    elif isinstance(raw_target_files, str):
        target_files_list = [raw_target_files]
    else:
        try:
            target_files_list = list(raw_target_files)
        except TypeError:
            target_files_list = []

    repo_url = str(state.get("repo_url", "")).strip()
    session_id = str(state.get("session_id", "")).strip()
    fix_branch = str(state.get("fix_branch", "")).strip()

    can_create_pr = (
        float(confidence_score) > CONFIDENCE_THRESHOLD
        and bool(fix_branch)
        and bool(proposed_patch)
        and bool(target_files_list)
    )
    dispatch_action = "create_pr" if can_create_pr else "create_issue"

    title_prefix = "Proposed fix" if dispatch_action == "create_pr" else "Test failure RCA"
    title = f"{title_prefix}: {rca_type.replace('_', ' ')}"

    body_lines = [
        f"Repository: {repo_url or 'unknown'}",
        f"Session ID: {session_id or 'unknown'}",
        f"RCA Type: {rca_type}",
        f"Confidence Score: {confidence_score}",
        "",
        "Root Cause Analysis:",
        rca_report or "N/A",
        "",
        "Proposed Fix:",
        proposed_fix or "N/A",
    ]
    if target_files_list:
        body_lines.extend(
            [
                "",
                "Target Files:",
                "\n".join(f"- {path}" for path in target_files_list),
            ]
        )
    if proposed_patch:
        body_lines.extend(
            [
                "",
                "Proposed Patch:",
                "```diff",
                proposed_patch,
                "```",
            ]
        )

    return {
        "dispatch_action": dispatch_action,
        "dispatch_target": "courier",
        "dispatch_payload": {
            "title": title,
            "body": "\n".join(body_lines),
            "confidence_score": float(confidence_score),
            "rca_type": rca_type,
            "session_id": session_id,
            "target_files": target_files_list,
            "proposed_patch": proposed_patch,
            "head_branch": fix_branch,
        },
    }
