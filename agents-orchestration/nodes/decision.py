from __future__ import annotations

from graph.state import SentinelState


def decision_node(state: SentinelState) -> dict[str, str]:
    results = state.get("test_results")
    if results is None:
        raise ValueError("state.test_results is required before decision step")
    if not isinstance(results, list):
        raise ValueError("state.test_results must be a list")

    non_passing = []
    for item in results:
        if not isinstance(item, dict):
            raise ValueError("each item in state.test_results must be a dict")
        status = item.get("status")
        if status not in {"passed", "failed", "skipped"}:
            raise ValueError(
                "each test result must include status as 'passed', 'failed', or 'skipped'"
            )
        if status in {"failed", "skipped"}:
            non_passing.append(item)

    if non_passing:
        return {"decision": "has_failures"}
    return {"decision": "all_pass"}
