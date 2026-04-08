from graph.state import SentinelState


# Backward-compatible import path
__all__ = ["SentinelState"]
class SentinelState(TypedDict, total=False):
    trigger_type: str
    repo_url: str
    branch: str
    commit_sha: str
    changed_files: list[str]
    code_context: str
    target_url: str

    # Architect output
    test_plan: str
    test_plan_approved: bool

    # Scripter output
    test_results: list[dict[str, Any]]

    # Watchdog output
    metrics_snapshot: dict[str, Any]
    anomalies: list[dict[str, Any]]

    # Healer output
    rca_report: str
    proposed_fix: str
    confidence_score: float
    fix_language: str

    # Courier output
    pr_url: Optional[str]
    issue_url: Optional[str]
    slack_sent: bool
