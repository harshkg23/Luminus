from __future__ import annotations

import re
from textwrap import dedent
from typing import Any

from graph.state import SentinelState
from llm.client import get_architect_llm, get_provider, is_real_only_mode


# ── Phase 1: Analyze changed files from the diff ────────────────────────────

def _extract_changed_files_from_diff(diff: str) -> list[dict[str, Any]]:
    """Parse the git diff to extract per-file change summaries."""
    if not diff.strip():
        return []

    files: list[dict[str, Any]] = []
    sections = re.split(r'(?=^diff --git )', diff, flags=re.MULTILINE)

    for section in sections:
        if not section.strip():
            continue
        header = re.match(r'diff --git a/(.*?) b/(.*?)\n', section)
        if not header:
            continue
        filepath = header.group(2)

        removed_lines: list[str] = []
        added_lines: list[str] = []
        for line in section.split("\n"):
            if line.startswith("-") and not line.startswith("---"):
                removed_lines.append(line[1:])
            elif line.startswith("+") and not line.startswith("+++"):
                added_lines.append(line[1:])

        files.append({
            "path": filepath,
            "removed": removed_lines,
            "added": added_lines,
            "removed_count": len(removed_lines),
            "added_count": len(added_lines),
        })

    return files


# ── Phase 2: Syntax & structural checks on the diff ─────────────────────────

def _check_syntax_issues(file_changes: list[dict[str, Any]]) -> list[str]:
    """Detect syntax problems in the PR's added lines."""
    issues: list[str] = []

    for fc in file_changes:
        path = fc["path"]
        if not path.endswith((".tsx", ".jsx", ".ts", ".js", ".html")):
            continue

        added_text = "\n".join(fc["added"])
        removed_text = "\n".join(fc["removed"])

        # Check for duplicate attributes in added code
        tag_re = re.compile(r'<[A-Za-z]\w*\s([\s\S]*?)>', re.MULTILINE)
        for tag_match in tag_re.finditer(added_text):
            attrs_block = tag_match.group(1)
            attr_names: list[str] = []
            for attr_match in re.finditer(r'([\w-]+)\s*=', attrs_block):
                name = attr_match.group(1)
                if name in attr_names:
                    issues.append(
                        f"DUPLICATE ATTRIBUTE in {path}: '{name}' appears twice "
                        f"on the same element. This is invalid JSX."
                    )
                attr_names.append(name)

        # Check for unbalanced JSX tags (opening < without closing >)
        open_count = added_text.count("<")
        close_count = added_text.count(">")
        if open_count > 0 and abs(open_count - close_count) > 2:
            issues.append(
                f"UNBALANCED TAGS in {path}: {open_count} opening '<' vs "
                f"{close_count} closing '>'. Possible broken JSX."
            )

        # Check for values changed to obviously wrong things
        for added_line in fc["added"]:
            stripped = added_line.strip()
            # Negative values where positive expected
            neg_match = re.search(r'value:\s*-\d+', stripped)
            if neg_match:
                issues.append(
                    f"SUSPICIOUS NEGATIVE VALUE in {path}: '{neg_match.group()}' — "
                    f"likely a bug if this represents a count or metric."
                )
            # Hardcoded disabled={true}
            if "disabled={true}" in stripped or "disabled={!false}" in stripped:
                issues.append(
                    f"HARDCODED DISABLED in {path}: button or input is forced disabled. "
                    f"This may be intentional or a bug."
                )

        # Check for data-testid renames (common source of selector breakage)
        removed_testids = set(re.findall(r'data-testid="([^"]+)"', removed_text))
        added_testids = set(re.findall(r'data-testid="([^"]+)"', added_text))
        renamed = removed_testids - added_testids
        if renamed:
            new_ids = added_testids - removed_testids
            issues.append(
                f"TESTID RENAMED in {path}: {renamed} was removed. "
                f"New testids: {new_ids or 'none'}. Tests targeting old IDs will break."
            )

    return issues


# ── Phase 3: Build the LLM prompt for test case generation ──────────────────

ARCHITECT_SYSTEM_PROMPT = dedent(
    """
    You are a QA architect for TollGate, a regression-detection pipeline.
    Your job is to analyze a PR and write E2E tests that CATCH regressions.

    You will receive a structured analysis of the PR with 3 sections:
    1. CHANGED FILES — list of files modified by the PR
    2. SYNTAX/STRUCTURAL ISSUES — automated checks that found problems
    3. GIT DIFF + CODE CONTEXT — the actual changes and current code

    === HOW TO READ THE DIFF ===

    - Lines with "-" = ORIGINAL correct code (removed by the PR)
    - Lines with "+" = NEW code introduced by the PR (may contain bugs)

    Your tests must assert the CORRECT/EXPECTED behavior (what SHOULD be there),
    NOT the current buggy state. If the PR introduced a bug, your test should
    FAIL — that triggers the Healer agent to fix the code.

    === TEST WRITING RULES ===

    1. For each changed file, identify what was modified.
    2. If the SYNTAX ISSUES section reports problems, write tests that
       verify the affected component renders correctly.
    3. For text/heading changes: assert the ORIGINAL correct text (from "-" lines).
    4. For disabled buttons: test that the button is CLICKABLE (Click "label").
    5. For negative/invalid values: assert the ORIGINAL correct value.
    6. For renamed data-testids: test that the ORIGINAL testid exists.
    7. Only test routes that exist in the code (check router/App.tsx).

    === CONCRETE EXAMPLES ===

    Diff: -<h1>Dashboard Overview</h1>  +<h1>Welcome to the Admin Panel</h1>
    Test: Assert page contains "Dashboard Overview"
    (Tests the CORRECT heading — will FAIL if the PR broke it)

    Diff: -disabled={false}  +disabled={true}
    Test: Click "Edit Profile"
    (Tests the button works — will FAIL if the PR disabled it)

    Diff: -value: 142,  +value: -42,
    Test: Assert page contains "142"
    (Tests the correct value — will FAIL on the negative bug)

    === OUTPUT FORMAT ===

    - ONLY scenario headings (## Scenario: ...) and numbered steps
    - No Overview, Objective, Preconditions, or Conclusion sections
    - Each step starts with: Navigate, Type, Click, Assert, Wait, Select, or Hover
    - Use paths from the router (/, /profile, /settings)
    - For Assert: Assert page contains "expected correct text"
    - For Click: Click "button label"
    - Include 2-5 scenarios targeting specific PR changes
    """
).strip()


def _build_user_prompt(
    state: SentinelState,
    file_changes: list[dict[str, Any]],
    syntax_issues: list[str],
    past_plans: list[dict[str, Any]] | None = None,
) -> str:
    """Build a 3-phase structured prompt for the LLM."""
    parts: list[str] = []

    parts.append(f"Repo: {state.get('repo_url', 'unknown')}")
    parts.append(f"Target URL: {state.get('target_url', 'http://localhost:5173')}")

    # ── RAG: Similar past test plans ──
    if past_plans:
        parts.append("\n=== SIMILAR PAST TEST PLANS (from Vector DB) ===\n")
        parts.append(
            "These plans were generated for similar PRs in the past. Use them as "
            "reference for structure and coverage, but adapt to the CURRENT PR's changes.\n"
        )
        for idx, plan in enumerate(past_plans, 1):
            parts.append(f"--- Past Plan {idx} ---")
            parts.append(f"Files Changed: {plan.get('changed_files', [])}")
            parts.append(f"Tests: {plan.get('total_tests', '?')} total, {plan.get('passed_tests', '?')} passed")
            plan_text = plan.get("test_plan", "")
            if plan_text:
                parts.append(f"Plan:\n{plan_text[:2000]}")
            parts.append("")
        parts.append(
            "Use the above as inspiration but write tests specifically targeting "
            "THIS PR's changes and regressions.\n"
        )

    # ── PHASE 1: Changed files summary ──
    parts.append("\n=== PHASE 1: CHANGED FILES ===\n")
    if file_changes:
        parts.append(f"This PR modifies {len(file_changes)} file(s):\n")
        for fc in file_changes:
            parts.append(
                f"  - {fc['path']} "
                f"(+{fc['added_count']} lines, -{fc['removed_count']} lines)"
            )
            # Show key removed/added content for quick reference
            for line in fc["removed"][:5]:
                stripped = line.strip()
                if stripped and not stripped.startswith("//"):
                    parts.append(f"      REMOVED: {stripped[:120]}")
            for line in fc["added"][:5]:
                stripped = line.strip()
                if stripped and not stripped.startswith("//"):
                    parts.append(f"      ADDED:   {stripped[:120]}")
    else:
        parts.append("No file changes detected.")

    # ── PHASE 2: Syntax/structural issues ──
    parts.append("\n=== PHASE 2: SYNTAX & STRUCTURAL ISSUES ===\n")
    if syntax_issues:
        parts.append(f"Automated analysis found {len(syntax_issues)} issue(s):\n")
        for i, issue in enumerate(syntax_issues, 1):
            parts.append(f"  {i}. {issue}")
        parts.append(
            "\nWrite tests that verify the affected components render correctly "
            "and the expected original values/text are present."
        )
    else:
        parts.append("No syntax issues detected by automated analysis.")

    # ── PHASE 3: Full diff + code context for detailed test writing ──
    parts.append("\n=== PHASE 3: GIT DIFF (full details) ===\n")
    parts.append(
        "Lines with '-' = ORIGINAL correct code (what should be there)\n"
        "Lines with '+' = NEW code from PR (may have bugs)\n"
    )
    git_diff = state.get("git_diff", "")
    if git_diff:
        truncated = git_diff[:10000] if len(git_diff) > 10000 else git_diff
        parts.append(truncated)
        if len(git_diff) > 10000:
            parts.append("... (diff truncated)")
    else:
        parts.append("No diff available.")

    code_context = state.get("code_context", "")
    if code_context:
        parts.append("\n=== CODE CONTEXT (current repo for route/structure reference) ===\n")
        truncated = code_context[:6000] if len(code_context) > 6000 else code_context
        parts.append(truncated)
        if len(code_context) > 6000:
            parts.append("... (code truncated)")

    parts.append(
        "\n\nNow write E2E test scenarios that assert the CORRECT expected behavior. "
        "Use the ORIGINAL ('-') lines to determine what SHOULD appear. "
        "If the PR introduced a regression, your tests should FAIL."
    )

    return "\n".join(parts)


# ── Validation ───────────────────────────────────────────────────────────────

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
        2. Assert page contains "Dashboard"

        ## Scenario: Navigation works
        1. Navigate to /
        2. Click "Settings"
        3. Assert page contains "Settings"
        """
    ).strip()


# ── Main node ────────────────────────────────────────────────────────────────

def architect_node(state: SentinelState) -> dict[str, object]:
    _validate_input(state)

    if state.get("force_mock"):
        return {"test_plan": _mock_test_plan(state)}

    provider = get_provider()
    llm = get_architect_llm()
    if llm is None:
        if is_real_only_mode():
            raise RuntimeError(
                f"Architect requires a live LLM, but no API key is configured "
                f"for provider '{provider}'"
            )
        return {"test_plan": _mock_test_plan(state)}

    # Phase 1: Analyze changed files
    git_diff = state.get("git_diff", "")
    file_changes = _extract_changed_files_from_diff(git_diff)

    # Phase 2: Check syntax/structural issues
    syntax_issues = _check_syntax_issues(file_changes)

    # Phase 2b: Retrieve similar past test plans from RAG
    past_plans: list[dict[str, Any]] = []
    try:
        from memory.retriever import get_similar_past_test_plans
        past_plans = get_similar_past_test_plans(
            changed_files=state.get("changed_files", []),
            git_diff=git_diff,
            top_k=2,
        )
    except Exception:
        pass

    rag_architect_matches = len(past_plans)
    rag_architect_insights = ""
    if past_plans:
        rag_architect_insights = (
            f"Found {rag_architect_matches} similar past test plan(s) from RAG. "
            f"Using these as reference for test structure and coverage."
        )

    rag_meta = {
        "rag_architect_matches": rag_architect_matches,
        "rag_architect_insights": rag_architect_insights,
    }

    # Phase 3: Build structured prompt and generate test plan
    user_prompt = _build_user_prompt(state, file_changes, syntax_issues, past_plans)

    try:
        response = llm.invoke(
            [
                {"role": "system", "content": ARCHITECT_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ]
        )
        content = (
            response.content
            if isinstance(response.content, str)
            else str(response.content)
        )
        return {"test_plan": content, **rag_meta}
    except Exception as err:
        if is_real_only_mode():
            raise RuntimeError(
                f"Architect live LLM call failed for provider '{provider}': "
                f"{err.__class__.__name__}"
            ) from err
        return {"test_plan": _mock_test_plan(state), **rag_meta}
