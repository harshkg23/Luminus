from typing import Any
from typing_extensions import TypedDict


class SentinelState(TypedDict, total=False):
    repo_url: str
    changed_files: list[str]
    git_diff: str
    target_url: str

    test_plan: str
    test_results: list[dict[str, Any]]
    decision: str
    session_id: str

    # Forward-compat fields for next phases
    rca_type: str
    rca_report: str
    proposed_fix: str
    proposed_patch: str
    target_files: list[str]
    confidence_score: float
    fix_branch: str
    dispatch_action: str
    dispatch_target: str
    dispatch_payload: dict[str, Any]
    dispatch_result_type: str
    dispatch_result_url: str
    dispatch_result_number: int

    # Local test controls
    simulate_all_pass: bool
    force_mock: bool
    force_mock_tests: bool
