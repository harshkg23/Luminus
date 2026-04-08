from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any
from urllib import error, request
from uuid import uuid4

from dotenv import load_dotenv

from graph.state import SentinelState

load_dotenv(Path(__file__).resolve().parents[1] / ".env")


def _mock_results(all_pass: bool) -> list[dict[str, Any]]:
    if all_pass:
        return [
            {"name": "Login flow", "status": "passed"},
            {"name": "Checkout flow", "status": "passed"},
        ]
    return [
        {"name": "Login flow", "status": "passed"},
        {"name": "Checkout flow", "status": "failed"},
    ]


def _parse_repo(repo_url: str) -> tuple[str | None, str | None]:
    if "/" not in repo_url:
        return None, None
    owner, repo = repo_url.split("/", 1)
    return owner or None, repo or None


def _get_backend_url() -> str:
    base_url = os.getenv("SENTINEL_BACKEND_URL", "http://localhost:3000").strip().rstrip("/")
    if not base_url:
        raise ValueError("SENTINEL_BACKEND_URL is required when RUN_TESTS_MODE=api")
    return base_url


def _get_target_url(state: SentinelState) -> str:
    target_url = (state.get("target_url") or os.getenv("TARGET_URL", "")).strip()
    if not target_url:
        raise ValueError("target_url is required in state or TARGET_URL must be set in .env")
    return target_url


def _get_session_id(state: SentinelState) -> str:
    existing = (state.get("session_id") or "").strip()
    if existing:
        return existing
    return f"ai_phase2_{uuid4().hex}"


def _call_run_tests_api(state: SentinelState) -> dict[str, object]:
    test_plan = (state.get("test_plan") or "").strip()
    if not test_plan:
        raise ValueError("state.test_plan is required before run_tests step")

    repo_url = (state.get("repo_url") or "").strip()
    owner, repo = _parse_repo(repo_url)
    session_id = _get_session_id(state)
    target_url = _get_target_url(state)

    payload: dict[str, object] = {
        "test_plan": test_plan,
        "target_url": target_url,
        "session_id": session_id,
    }
    if owner and repo:
        payload["owner"] = owner
        payload["repo"] = repo

    req = request.Request(
        url=f"{_get_backend_url()}/api/agent/run-tests",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    timeout = float(os.getenv("RUN_TESTS_TIMEOUT_SECONDS", "60"))

    try:
        with request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except error.HTTPError as err:
        body = err.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"run-tests API error {err.code}: {body}") from err
    except error.URLError as err:
        raise RuntimeError(f"run-tests API unavailable: {err.reason}") from err

    results = data.get("results")
    if not isinstance(results, list):
        raise RuntimeError("run-tests API response missing results[]")

    return {
        "session_id": data.get("session_id", session_id),
        "test_results": results,
    }


def run_tests_node(state: SentinelState) -> dict[str, object]:
    force_mock_tests = bool(state.get("force_mock_tests", False))
    mode = os.getenv("RUN_TESTS_MODE", "api").strip().lower()

    if force_mock_tests or mode == "mock":
        return {
            "session_id": _get_session_id(state),
            "test_results": _mock_results(bool(state.get("simulate_all_pass", False))),
        }

    return _call_run_tests_api(state)
