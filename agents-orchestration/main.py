from __future__ import annotations

import argparse
import os

from dotenv import load_dotenv

from graph.workflow import build_phase1_graph


def build_initial_state(
    empty_changed_files: bool,
    simulate_all_pass: bool,
    force_mock: bool,
    force_mock_tests: bool,
) -> dict:
    import subprocess
    # Compute repository root as the parent directory of this file's directory.
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    try:
        result = subprocess.run(
            ["git", "-C", repo_root, "diff", "HEAD~1", "--", "src/app/", "tests/"],
            capture_output=True,
            text=True,
        )
        if result.returncode == 0:
            git_diff = result.stdout
        else:
            git_diff = "No git diff available."
    except Exception:
        git_diff = "No git diff available."
        
    return {
        "repo_url": "Arpit529Srivastava/Hack-karo",
        "changed_files": [] if empty_changed_files else ["src/app/auth/page.tsx", "src/app/dashboard/page.tsx"],
        "git_diff": git_diff,
        "target_url": os.getenv("TARGET_URL", "http://localhost:3000"),
        "simulate_all_pass": simulate_all_pass,
        "force_mock": force_mock,
        "force_mock_tests": force_mock_tests,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Run SentinelQA AI engine workflow")
    parser.add_argument("--all-pass", action="store_true", help="Simulate all tests passing in mock test mode")
    parser.add_argument("--empty-changed-files", action="store_true", help="Run with changed_files=[]")
    parser.add_argument("--force-mock", action="store_true", help="Bypass live LLM and use mock Architect output")
    parser.add_argument("--mock-tests", action="store_true", help="Bypass backend /api/agent/run-tests and use mock test results")
    args = parser.parse_args()

    load_dotenv()

    app = build_phase1_graph()
    state = build_initial_state(
        args.empty_changed_files,
        args.all_pass,
        args.force_mock,
        args.mock_tests,
    )
    result = app.invoke(state)

    print("--- TEST PLAN ---")
    print(result.get("test_plan", ""))
    print("\n--- TEST RESULTS ---")
    print(result.get("test_results", []))
    print("\n--- SESSION ID ---")
    print(result.get("session_id", ""))
    print("\n--- DECISION ---")
    print(result.get("decision", ""))
    if result.get("rca_type"):
        print("\n--- RCA TYPE ---")
        print(result.get("rca_type", ""))
    if result.get("rca_report"):
        print("\n--- RCA REPORT ---")
        print(result.get("rca_report", ""))
    if result.get("proposed_fix"):
        print("\n--- PROPOSED FIX ---")
        print(result.get("proposed_fix", ""))
    if result.get("target_files"):
        print("\n--- TARGET FILES ---")
        print(result.get("target_files", []))
    if result.get("proposed_patch"):
        print("\n--- PROPOSED PATCH ---")
        print(result.get("proposed_patch", ""))
    if result.get("confidence_score") is not None:
        print("\n--- CONFIDENCE SCORE ---")
        print(result.get("confidence_score", ""))
    if result.get("dispatch_action"):
        print("\n--- DISPATCH ACTION ---")
        print(result.get("dispatch_action", ""))
    if result.get("dispatch_payload"):
        print("\n--- DISPATCH PAYLOAD ---")
        print(result.get("dispatch_payload", ""))
    if result.get("dispatch_result_type"):
        print("\n--- DISPATCH RESULT TYPE ---")
        print(result.get("dispatch_result_type", ""))
    if result.get("dispatch_result_url"):
        print("\n--- DISPATCH RESULT URL ---")
        print(result.get("dispatch_result_url", ""))
    if result.get("dispatch_result_number") is not None:
        print("\n--- DISPATCH RESULT NUMBER ---")
        print(result.get("dispatch_result_number", ""))


if __name__ == "__main__":
    main()
