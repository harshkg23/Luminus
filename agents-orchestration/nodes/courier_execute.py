from __future__ import annotations

import json
import os
import socket
import subprocess
import tempfile
from pathlib import Path
from typing import Any
from urllib import error, request

from dotenv import load_dotenv

from graph.state import SentinelState

load_dotenv(Path(__file__).resolve().parents[1] / ".env")


def _backend_url() -> str:
    raw = os.getenv("SENTINEL_BACKEND_URL", "http://localhost:3000")
    value = raw.strip().rstrip("/")
    if not value:
        raise ValueError(
            "SENTINEL_BACKEND_URL environment variable is empty or only whitespace; please set it to a valid backend URL."
        )
    return value


def courier_execute_node(state: SentinelState) -> dict[str, object]:
    dispatch_action = str(state.get("dispatch_action", "")).strip()
    dispatch_payload = state.get("dispatch_payload")

    if not dispatch_action:
        raise ValueError("state.dispatch_action is required before courier_execute step")
    if not isinstance(dispatch_payload, dict):
        raise ValueError("state.dispatch_payload must be a dict before courier_execute step")

    # If action is PR, we must apply the patch, commit, and push branch first
    if dispatch_action == "create_pr":
        head_branch = dispatch_payload.get("head_branch")
        proposed_patch = dispatch_payload.get("proposed_patch")

        if head_branch and proposed_patch:
            repo_root = Path(__file__).resolve().parents[2]
            patch_path = ""
            try:
                # 1. Checkout new branch
                subprocess.run(["git", "checkout", "-b", head_branch], cwd=repo_root, check=True, capture_output=True)

                # 2. Write patch to temp file
                with tempfile.NamedTemporaryFile(mode="w", delete=False, suffix=".diff", encoding="utf-8") as f:
                    f.write(proposed_patch)
                    patch_path = f.name

                # 3. Check patch applicability without modifying the working tree
                check_res = subprocess.run(
                    ["git", "apply", "--check", patch_path],
                    cwd=repo_root,
                    capture_output=True,
                    text=True,
                )
                
                if check_res.returncode != 0:
                    # Patch failed to apply cleanly in dry run. Fall back to issue.
                    dispatch_action = "create_issue"
                    dispatch_payload["title"] = "[Failed to Apply Patch] " + dispatch_payload.get("title", "")
                    dispatch_payload["body"] = (
                        "**Note**: The Healer generated a patch but it failed to apply cleanly.\n"
                        f"```\n{check_res.stderr}\n```\n\n"
                        f"{dispatch_payload.get('body', '')}"
                    )
                    state["dispatch_action"] = dispatch_action
                    state["dispatch_payload"] = dispatch_payload
                else:
                    # 4. Apply patch for real
                    apply_res = subprocess.run(
                        ["git", "apply", patch_path],
                        cwd=repo_root,
                        capture_output=True,
                        text=True,
                        check=True,
                    )
                    # 5. Stage and commit all resulting changes, if any
                    status_res = subprocess.run(
                        ["git", "status", "--porcelain"],
                        cwd=repo_root,
                        capture_output=True,
                        text=True,
                        check=True,
                    )
                    if status_res.stdout.strip():
                        subprocess.run(["git", "add", "-A"], cwd=repo_root, check=True)
                        session_id = dispatch_payload.get("session_id", "unknown")
                        subprocess.run(
                            ["git", "commit", "-m", f"[SentinelQA] Auto-fix for {session_id}"],
                            cwd=repo_root,
                            check=True,
                        )
                    # 6. Push branch
                    subprocess.run(
                        ["git", "push", "-u", "origin", head_branch],
                        cwd=repo_root,
                        check=True,
                    )
            except Exception as e:
                # Any git error falls back to issue
                dispatch_action = "create_issue"
                dispatch_payload["title"] = "[Git Error] " + dispatch_payload.get("title", "")
                dispatch_payload["body"] = f"**Note**: Local git branch or push failed.\n```\n{e}\n```\n\n{dispatch_payload.get('body', '')}"
                state["dispatch_action"] = dispatch_action
                state["dispatch_payload"] = dispatch_payload
            finally:
                if patch_path and os.path.exists(patch_path):
                    try:
                        os.remove(patch_path)
                    except Exception:
                        pass

    req = request.Request(
        url=f"{_backend_url()}/api/agent/courier",
        data=json.dumps(
            {
                "dispatch_action": dispatch_action,
                "dispatch_payload": dispatch_payload,
            }
        ).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except error.HTTPError as err:
        body = err.read().decode("utf-8", errors="replace")
        return {
            "dispatch_result_type": "error",
            "dispatch_result_url": "",
            "dispatch_result_number": 0,
            "dispatch_payload": {
                **dispatch_payload,
                "execution_error": f"courier API error {err.code}: {body}",
            },
        }
    except error.URLError as err:
        reason = err.reason
        if isinstance(reason, socket.timeout):
            message = "courier API timed out after 30 seconds"
        else:
            message = f"courier API unavailable: {reason}"
        return {
            "dispatch_result_type": "error",
            "dispatch_result_url": "",
            "dispatch_result_number": 0,
            "dispatch_payload": {
                **dispatch_payload,
                "execution_error": message,
            },
        }
    except (TimeoutError, socket.timeout):
        return {
            "dispatch_result_type": "error",
            "dispatch_result_url": "",
            "dispatch_result_number": 0,
            "dispatch_payload": {
                **dispatch_payload,
                "execution_error": "courier API timed out after 30 seconds",
            },
        }

    return {
        "dispatch_result_type": data.get("type"),
        "dispatch_result_url": data.get("url"),
        "dispatch_result_number": data.get("number"),
    }
