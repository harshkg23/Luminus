from typing import Any
from typing_extensions import TypedDict


class SentinelState(TypedDict, total=False):
    repo_url: str
    branch: str
    changed_files: list[str]
    git_diff: str
    code_context: str
    target_url: str
    trigger_type: str
    commit_sha: str

    test_plan: str
    test_results: list[dict[str, Any]]
    decision: str
    session_id: str

    # Forward-compat fields for next phases
    rca_type: str
    rca_report: str
    proposed_fix: str
    proposed_patch: str
    file_edits: list[dict[str, str]]
    target_files: list[str]
    confidence_score: float
    fix_branch: str
    dispatch_action: str
    dispatch_target: str
    dispatch_payload: dict[str, Any]
    dispatch_result_type: str
    dispatch_result_url: str
    dispatch_result_number: int

    # RAG insight metadata (set by architect/healer, returned to orchestrator)
    rag_healer_matches: int
    rag_healer_insights: str
    rag_architect_matches: int
    rag_architect_insights: str

    # Local test controls
    simulate_all_pass: bool
    force_mock: bool
    force_mock_tests: bool
