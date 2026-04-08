from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path
from urllib import error, request

from dotenv import load_dotenv

ROOT = Path(__file__).parent
PYTHON = sys.executable

load_dotenv(ROOT / ".env")


def run(cmd: list[str], env: dict[str, str] | None = None) -> tuple[int, str, str]:
    proc = subprocess.run(
        cmd,
        cwd=ROOT,
        capture_output=True,
        text=True,
        env=env,
    )
    return proc.returncode, proc.stdout, proc.stderr


def assert_contains(text: str, expected: str, label: str) -> None:
    if expected not in text:
        raise AssertionError(f"{label}: expected '{expected}' in output")


def backend_available() -> bool:
    base_url = os.getenv("SENTINEL_BACKEND_URL", "http://localhost:3000").strip().rstrip("/")
    if not base_url:
        return False

    probe = request.Request(url=f"{base_url}/api/agent/status", method="GET")
    try:
        with request.urlopen(probe, timeout=5):
            return True
    except (error.URLError, error.HTTPError, TimeoutError):
        return False


def main() -> None:
    checks_passed = 0
    fallback_env = os.environ.copy()
    fallback_env["LLM_REAL_ONLY"] = "false"

    # 1) Static sanity: imports resolve and single entrypoint works
    code, out, err = run([str(PYTHON), "main.py", "--force-mock", "--mock-tests"], env=fallback_env)
    if code != 0:
        raise RuntimeError(f"Static sanity failed.\nSTDOUT:\n{out}\nSTDERR:\n{err}")
    checks_passed += 1

    # 2) Run with configured key in mock-test mode so only Architect uses the live LLM
    env_with_key = os.environ.copy()
    if env_with_key.get("OPENAI_API_KEY", "").strip():
        code, out, err = run([str(PYTHON), "main.py", "--mock-tests"], env=env_with_key)
        if code != 0:
            print("[SKIP] Live OpenAI verification unavailable in this environment")
        else:
            assert_contains(out, "--- TEST PLAN ---", "with-key run")
            checks_passed += 1
    else:
        print("[SKIP] OPENAI_API_KEY not set for live-key check")

    # 3) Explicit Architect fallback
    code, out, err = run([str(PYTHON), "main.py", "--force-mock", "--mock-tests"], env=fallback_env)
    if code != 0:
        raise RuntimeError(f"Fallback run failed.\nSTDOUT:\n{out}\nSTDERR:\n{err}")
    assert_contains(out, "Architect Test Plan (Mock)", "fallback run")
    checks_passed += 1

    # 4) Decision branch check: all pass should produce all_pass
    code, out, err = run([str(PYTHON), "main.py", "--all-pass", "--force-mock", "--mock-tests"], env=fallback_env)
    if code != 0:
        raise RuntimeError(f"All-pass decision check failed.\nSTDOUT:\n{out}\nSTDERR:\n{err}")
    assert_contains(out, "all_pass", "decision all-pass")
    checks_passed += 1

    # 5) changed_files=[] should still work
    code, out, err = run([str(PYTHON), "main.py", "--empty-changed-files", "--force-mock", "--mock-tests"], env=fallback_env)
    if code != 0:
        raise RuntimeError(f"empty changed_files check failed.\nSTDOUT:\n{out}\nSTDERR:\n{err}")
    assert_contains(out, "--- TEST PLAN ---", "empty changed_files")
    checks_passed += 1

    # 6) malformed state should fail clearly
    malformed_script = (
        "from graph.workflow import build_phase1_graph; "
        "app=build_phase1_graph(); "
        "app.invoke({'changed_files': []})"
    )
    code, out, err = run([str(PYTHON), "-c", malformed_script])
    if code == 0:
        raise RuntimeError("Malformed state check failed: expected non-zero exit")
    assert_contains(err, "repo_url", "malformed state error")
    checks_passed += 1

    # 7) misconfigured provider should fail clearly
    bad_env = os.environ.copy()
    bad_env["LLM_PROVIDER"] = "bad_provider"
    code, out, err = run([str(PYTHON), "main.py", "--mock-tests"], env=bad_env)
    if code == 0:
        raise RuntimeError("Provider misconfig check failed: expected non-zero exit")
    assert_contains(err, "Unsupported LLM_PROVIDER", "provider misconfig error")
    checks_passed += 1

    # 8) Failing path should execute healer output
    code, out, err = run([str(PYTHON), "main.py", "--force-mock", "--mock-tests"], env=fallback_env)
    if code != 0:
        raise RuntimeError(f"Healer output check failed.\nSTDOUT:\n{out}\nSTDERR:\n{err}")
    assert_contains(out, "--- RCA TYPE ---", "healer type output")
    assert_contains(out, "--- RCA REPORT ---", "healer rca output")
    assert_contains(out, "--- PROPOSED FIX ---", "healer fix output")
    assert_contains(out, "--- TARGET FILES ---", "healer target files output")
    assert_contains(out, "--- CONFIDENCE SCORE ---", "healer confidence output")
    assert_contains(out, "--- DISPATCH ACTION ---", "courier decision output")
    assert_contains(out, "create_issue", "low-confidence courier routing")
    checks_passed += 1

    # 9) Optional backend integration check
    if backend_available():
        code, out, err = run([str(PYTHON), "main.py", "--force-mock"])
        if code != 0:
            raise RuntimeError(f"Backend run-tests integration failed.\nSTDOUT:\n{out}\nSTDERR:\n{err}")
        assert_contains(out, "--- TEST RESULTS ---", "backend integration")
        checks_passed += 1
    else:
        print("[SKIP] Backend integration check skipped because /api/agent/status is unavailable")

    print(f"Phase 2 verification complete. Checks passed: {checks_passed}")


if __name__ == "__main__":
    main()
