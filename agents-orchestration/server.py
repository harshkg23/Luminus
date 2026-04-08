"""
FastAPI server for TollGate AI Engine.

Exposes HTTP endpoints that call the LangGraph pipeline.
"""

import os
from pathlib import Path
from typing import Any

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from sentinel.graph import build_phase1_graph, build_healer_graph, build_healer_only_graph
from sentinel.state import SentinelState

# Always load agents-orchestration/.env (cwd-independent — fixes missing OPENAI_API_KEY).
load_dotenv(Path(__file__).resolve().parent / ".env")
load_dotenv()

app = FastAPI(
    title="TollGate AI Engine",
    version="1.0.0",
    description="LangGraph-powered test generation and analysis service",
)

# Compile graphs once at startup — reused for every request
_phase1_graph = build_phase1_graph()
_healer_graph = build_healer_graph()
_healer_only_graph = build_healer_only_graph()

# ── Request/Response Models ─────────────────────────────────────────────────


class GenerateTestPlanRequest(BaseModel):
    code_context: str
    changed_files: list[str]
    target_url: str
    repo_url: str | None = None
    branch: str | None = "main"
    commit_sha: str | None = None
    git_diff: str | None = None


class GenerateTestPlanResponse(BaseModel):
    test_plan: str
    provider: str  # "mock" | "openai" | "anthropic"
    rag_architect_matches: int = 0
    rag_architect_insights: str = ""


class AnalyzeFailureRequest(BaseModel):
    test_results: list[dict[str, Any]]
    code_context: str
    diff: str


class AnalyzeFailureResponse(BaseModel):
    rca_report: str
    proposed_fix: str
    confidence: float


class RunPipelineRequest(BaseModel):
    repo_url: str
    changed_files: list[str] = []
    target_url: str
    branch: str | None = "main"
    commit_sha: str | None = None
    git_diff: str | None = None
    # Pre-supply test results so the full graph (Healer → Courier) runs
    test_results: list[dict[str, Any]] | None = None
    session_id: str | None = None
    force_mock: bool = False
    force_mock_tests: bool = False
    simulate_all_pass: bool = False


class RunPipelineResponse(BaseModel):
    session_id: str
    decision: str
    test_plan: str
    test_results: list[dict[str, Any]]
    rca_type: str | None = None
    rca_report: str | None = None
    proposed_fix: str | None = None
    proposed_patch: str | None = None
    confidence_score: float | None = None
    fix_branch: str | None = None
    target_files: list[str] | None = None
    dispatch_action: str | None = None
    dispatch_result_type: str | None = None
    dispatch_result_url: str | None = None
    dispatch_result_number: int | None = None


class RunHealerRequest(BaseModel):
    repo_url: str
    changed_files: list[str] = []
    target_url: str
    branch: str | None = "main"
    git_diff: str | None = None
    test_results: list[dict[str, Any]]
    session_id: str | None = None
    force_mock: bool = False


class FileEdit(BaseModel):
    file: str
    search: str
    replace: str


class RunHealerResponse(BaseModel):
    session_id: str
    decision: str
    rca_type: str | None = None
    rca_report: str | None = None
    proposed_fix: str | None = None
    proposed_patch: str | None = None
    file_edits: list[FileEdit] | None = None
    confidence_score: float | None = None
    fix_branch: str | None = None
    target_files: list[str] | None = None
    rag_healer_matches: int = 0
    rag_healer_insights: str = ""


# ── Endpoints ───────────────────────────────────────────────────────────────


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    provider = os.getenv("LLM_PROVIDER", "openai")
    has_openai_key = bool(os.getenv("OPENAI_API_KEY", "").strip())
    has_anthropic_key = bool(os.getenv("ANTHROPIC_API_KEY", "").strip())

    return {
        "status": "healthy",
        "service": "tollgate-ai-engine",
        "version": "1.0.0",
        "llm_provider": provider,
        "llm_available": has_openai_key or has_anthropic_key,
    }


@app.post("/generate-test-plan", response_model=GenerateTestPlanResponse)
async def generate_test_plan(request: GenerateTestPlanRequest):
    """
    Generate a test plan using the Architect agent.
    
    Runs the LangGraph Architect node with the provided code context.
    Falls back to mock mode if no LLM API key is configured.
    """
    try:
        graph = _phase1_graph

        # Build state from request
        initial_state: SentinelState = {
            "trigger_type": "api",
            "repo_url": request.repo_url or "unknown",
            "branch": request.branch or "main",
            "commit_sha": request.commit_sha or "unknown",
            "changed_files": request.changed_files,
            "code_context": request.code_context,
            "target_url": request.target_url,
            "git_diff": request.git_diff or "",
        }

        # Run graph (Architect + Mock Scripter)
        result = graph.invoke(initial_state)

        test_plan = result.get("test_plan", "")
        if not test_plan:
            raise HTTPException(
                status_code=500, detail="Graph execution succeeded but no test_plan in state"
            )

        # Detect if we used mock or real LLM
        provider = os.getenv("LLM_PROVIDER", "openai")
        has_key = bool(
            os.getenv("OPENAI_API_KEY", "").strip()
            or os.getenv("ANTHROPIC_API_KEY", "").strip()
        )
        provider_used = provider if has_key else "mock"

        return GenerateTestPlanResponse(
            test_plan=test_plan,
            provider=provider_used,
            rag_architect_matches=int(result.get("rag_architect_matches", 0)),
            rag_architect_insights=str(result.get("rag_architect_insights", "")),
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Graph execution failed: {e}")


@app.post("/run-pipeline", response_model=RunPipelineResponse)
async def run_pipeline(request: RunPipelineRequest):
    """
    Run the full LangGraph pipeline:
      Architect → run_tests → decision → [Healer → courier_decision → courier_execute]

    If test_results are pre-supplied (e.g. already run by Playwright MCP on the
    Next.js side), the graph skips re-running tests and goes straight to decision
    → Healer → Courier.
    """
    try:
        from uuid import uuid4

        initial_state: SentinelState = {
            "repo_url": request.repo_url,
            "changed_files": request.changed_files,
            "target_url": request.target_url,
            "git_diff": request.git_diff or "",
            "session_id": request.session_id or f"pipeline_{uuid4().hex}",
            "branch": request.branch or "main",
            "force_mock": request.force_mock,
            "force_mock_tests": request.force_mock_tests,
            "simulate_all_pass": request.simulate_all_pass,
        }

        if request.test_results is not None:
            # Test results pre-supplied → skip architect + run_tests,
            # go straight to decision → healer → courier
            initial_state["test_results"] = request.test_results
            graph = _healer_graph
        else:
            graph = _phase1_graph

        result = graph.invoke(initial_state)

        return RunPipelineResponse(
            session_id=str(result.get("session_id", "")),
            decision=str(result.get("decision", "")),
            test_plan=str(result.get("test_plan", "")),
            test_results=result.get("test_results") or [],
            rca_type=result.get("rca_type"),
            rca_report=result.get("rca_report"),
            proposed_fix=result.get("proposed_fix"),
            proposed_patch=result.get("proposed_patch"),
            confidence_score=result.get("confidence_score"),
            fix_branch=result.get("fix_branch"),
            target_files=result.get("target_files"),
            dispatch_action=result.get("dispatch_action"),
            dispatch_result_type=result.get("dispatch_result_type"),
            dispatch_result_url=result.get("dispatch_result_url"),
            dispatch_result_number=result.get("dispatch_result_number"),
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Pipeline execution failed: {e}")


@app.post("/run-healer", response_model=RunHealerResponse)
async def run_healer(request: RunHealerRequest):
    """
    Run only the Healer agent (RCA + proposed fix) without courier actions.

    Uses the healer-only graph: decision → healer → END.
    Returns the RCA analysis and proposed patch so the caller can bundle
    code fixes into a unified PR alongside test scripts.
    """
    try:
        from uuid import uuid4

        initial_state: SentinelState = {
            "repo_url": request.repo_url,
            "changed_files": request.changed_files,
            "target_url": request.target_url,
            "git_diff": request.git_diff or "",
            "session_id": request.session_id or f"healer_{uuid4().hex}",
            "branch": request.branch or "main",
            "test_results": request.test_results,
            "force_mock": request.force_mock,
        }

        result = _healer_only_graph.invoke(initial_state)

        raw_edits = result.get("file_edits") or []
        file_edits = [
            FileEdit(file=e["file"], search=e["search"], replace=e["replace"])
            for e in raw_edits
            if isinstance(e, dict) and e.get("file") and e.get("search") and "replace" in e
        ]

        return RunHealerResponse(
            session_id=str(result.get("session_id", "")),
            decision=str(result.get("decision", "")),
            rca_type=result.get("rca_type"),
            rca_report=result.get("rca_report"),
            proposed_fix=result.get("proposed_fix"),
            proposed_patch=result.get("proposed_patch"),
            file_edits=file_edits if file_edits else None,
            confidence_score=result.get("confidence_score"),
            fix_branch=result.get("fix_branch"),
            target_files=result.get("target_files"),
            rag_healer_matches=int(result.get("rag_healer_matches", 0)),
            rag_healer_insights=str(result.get("rag_healer_insights", "")),
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Healer execution failed: {e}")


@app.post("/analyze-failure", response_model=AnalyzeFailureResponse)
async def analyze_failure(request: AnalyzeFailureRequest):
    """
    Analyze test failures and propose fixes (Healer agent).
    
    TODO: Implement once Healer agent node is ready.
    For now, returns a mock response.
    """
    # Mock response until Healer agent is implemented
    failed_count = sum(
        1 for r in request.test_results if r.get("status") == "failed"
    )

    return AnalyzeFailureResponse(
        rca_report=f"## Mock RCA Report\n\n{failed_count} tests failed. Healer agent not yet implemented.",
        proposed_fix="// TODO: Implement Healer agent\n// This will contain actual fix suggestions",
        confidence=0.5,
    )


class StoreFixRequest(BaseModel):
    repo_url: str = ""
    session_id: str = ""
    rca_type: str = ""
    rca_report: str = ""
    proposed_fix: str = ""
    proposed_patch: str = ""
    file_edits: list[dict[str, Any]] = []
    target_files: list[str] = []
    fix_branch: str = ""
    confidence_score: float = 0.0
    changed_files: list[str] = []
    git_diff: str = ""
    test_plan: str = ""
    total_tests: int = 0
    passed_tests: int = 0
    failed_tests_count: int = 0
    failed_tests: list[dict[str, Any]] = []
    pr_url: str = ""
    pr_number: int | None = None


@app.post("/store-fix")
async def store_fix(request: StoreFixRequest):
    """Store a successful fix + test plan in the vector DB for future RAG retrieval."""
    from memory.store import store_fix_from_api, store_test_plan

    data = request.model_dump()
    fix_stored = store_fix_from_api(data)
    plan_stored = store_test_plan(data)

    return {
        "fix_stored": fix_stored,
        "plan_stored": plan_stored,
        "message": "Stored in RAG" if (fix_stored or plan_stored) else "Storage skipped (check MONGODB_URI/OPENAI_API_KEY)",
    }


# ── Server Entry Point ──────────────────────────────────────────────────────

if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    host = os.getenv("HOST", "0.0.0.0")

    print(f"🚀 Starting TollGate AI Engine on {host}:{port}")
    print(f"   LLM Provider: {os.getenv('LLM_PROVIDER', 'openai')}")
    print(f"   Docs: http://{host}:{port}/docs")

    uvicorn.run(
        app,
        host=host,
        port=port,
        log_level="info",
    )
