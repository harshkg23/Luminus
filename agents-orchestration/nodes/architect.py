from __future__ import annotations

from textwrap import dedent

from graph.state import SentinelState
from llm.client import get_architect_llm, get_provider, is_real_only_mode

ARCHITECT_SYSTEM_PROMPT = dedent(
    """
    You are a QA architect.
    Given repository context and changed files, generate a concise E2E test plan in Markdown.

    Output format rules:
    - Output only scenario headings and executable numbered steps
    - Do not include Overview, Objective, Preconditions, Expected Outcome, Notes, or Conclusion sections
    - Each executable step must start with exactly one of these verbs:
      Navigate, Type, Click, Assert, Wait, Select, Hover
    - Prefer paths like /auth or /dashboard for navigation steps
    - For Type steps, use: Type "value" into "field label"
    - For Click steps, use: Click "button or link text"
    - For Assert steps, use: Assert page contains "expected visible text"
    - Keep steps concrete and UI-observable
    - Include at least 2 scenarios

    Example:
    ## Scenario: Auth page renders
    1. Navigate to /auth
    2. Assert page contains "Sign in"
    3. Assert page contains "Continue with GitHub"
    """
).strip()


def _validate_input(state: SentinelState) -> None:
    if not state.get("repo_url"):
        raise ValueError("state.repo_url is required")
    changed_files = state.get("changed_files")
    if changed_files is None:
        raise ValueError("state.changed_files is required (can be an empty list)")
    if not isinstance(changed_files, list):
        raise ValueError("state.changed_files must be a list[str]")


def _mock_test_plan(state: SentinelState) -> str:
    changed = state.get("changed_files", [])
    changed_text = ", ".join(changed[:5]) if changed else "None"
    return dedent(
        f"""
        ## Architect Test Plan (Mock)

        Repository: {state.get('repo_url')}
        Changed Files: {changed_text}

        ## Scenario: Landing page loads
        1. Navigate to /
        2. Assert page contains "Autonomous Quality Engineering"

        ## Scenario: Auth page renders
        1. Navigate to /auth
        2. Assert page contains "Sign in"
        3. Assert page contains "Continue with GitHub"
        """
    ).strip()


def architect_node(state: SentinelState) -> dict[str, object]:
    _validate_input(state)

    if state.get("force_mock"):
        return {"test_plan": _mock_test_plan(state)}

    provider = get_provider()
    llm = get_architect_llm()
    if llm is None:
        if is_real_only_mode():
            raise RuntimeError(
                f"Architect requires a live LLM, but no API key is configured for provider '{provider}'"
            )
        return {"test_plan": _mock_test_plan(state)}

    user_prompt = dedent(
        f"""
        Repo: {state['repo_url']}
        Changed files: {state.get('changed_files', [])}

        Generate an E2E test plan using only executable numbered steps.
        """
    ).strip()

    try:
        response = llm.invoke(
            [
                {"role": "system", "content": ARCHITECT_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ]
        )
        content = response.content if isinstance(response.content, str) else str(response.content)
        return {"test_plan": content}
    except Exception as err:
        if is_real_only_mode():
            raise RuntimeError(
                f"Architect live LLM call failed for provider '{provider}': {err.__class__.__name__}"
            ) from err
        return {"test_plan": _mock_test_plan(state)}
