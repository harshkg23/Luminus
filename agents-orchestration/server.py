"""
FastAPI server for TollGate AI Engine.

Exposes HTTP endpoints that call the LangGraph pipeline.
Includes Prometheus instrumentation for real observability.
"""

import os
import time
from pathlib import Path
from typing import Any

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ── Prometheus ──────────────────────────────────────────────────────────────
from prometheus_client import (
    Counter,
    Histogram,
    Gauge,
    Info,
    generate_latest,
    CONTENT_TYPE_LATEST,
    CollectorRegistry,
    REGISTRY,
)

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

# ── CORS — allow the Next.js frontend to query /metrics & /prom/* ──────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Prometheus Metrics ─────────────────────────────────────────────────────

# Pipeline
PIPELINE_RUNS = Counter(
    "tollgate_pipeline_runs_total",
    "Total number of pipeline executions",
    ["status"],  # completed | failed
)
PIPELINE_DURATION = Histogram(
    "tollgate_pipeline_duration_seconds",
    "Pipeline execution duration in seconds",
    buckets=[1, 5, 10, 30, 60, 120, 300, 600],
)

# Agent steps
AGENT_STEP_DURATION = Histogram(
    "tollgate_agent_step_duration_seconds",
    "Duration of individual agent steps",
    ["agent"],
    buckets=[0.5, 1, 2, 5, 10, 30, 60, 120],
)

# Tests
TESTS_TOTAL = Counter(
    "tollgate_tests_total",
    "Total tests executed",
    ["result"],  # passed | failed
)
TESTS_PER_RUN = Histogram(
    "tollgate_tests_per_run",
    "Number of tests per pipeline run",
    buckets=[1, 5, 10, 20, 50, 100],
)

# Healer
HEALER_CONFIDENCE = Gauge(
    "tollgate_healer_confidence_score",
    "Latest healer confidence score",
)
HEALER_RUNS = Counter(
    "tollgate_healer_runs_total",
    "Total healer invocations",
    ["decision"],  # ship | block | skip
)

# Test plan generation
TEST_PLAN_DURATION = Histogram(
    "tollgate_test_plan_generation_seconds",
    "Time to generate a test plan (Architect agent)",
    buckets=[1, 2, 5, 10, 30, 60],
)

# API requests
API_REQUESTS = Counter(
    "tollgate_api_requests_total",
    "Total API requests",
    ["method", "endpoint", "status_code"],
)
API_LATENCY = Histogram(
    "tollgate_api_request_duration_seconds",
    "API request latency",
    ["method", "endpoint"],
    buckets=[0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
)

# RAG memory
RAG_QUERIES = Counter(
    "tollgate_rag_queries_total",
    "Total RAG vector DB queries",
    ["agent"],
)
RAG_MATCHES = Histogram(
    "tollgate_rag_matches_per_query",
    "Number of RAG matches returned per query",
    ["agent"],
    buckets=[0, 1, 2, 3, 5, 10],
)

# Server info
SERVER_INFO = Info("tollgate_server", "TollGate AI Engine metadata")
SERVER_INFO.info({
    "version": "1.0.0",
    "llm_provider": os.getenv("LLM_PROVIDER", "openai"),
})

# Active pipelines (gauge)
ACTIVE_PIPELINES = Gauge(
    "tollgate_active_pipelines",
    "Number of currently running pipelines",
)


# ── Middleware: auto-count every request ────────────────────────────────────
@app.middleware("http")
async def prometheus_middleware(request: Request, call_next):
    """Record request count + latency for every API call."""
    start = time.time()
    response: Response = await call_next(request)
    elapsed = time.time() - start

    path = request.url.path
    # Collapse path params but keep main route segments
    API_REQUESTS.labels(
        method=request.method,
        endpoint=path,
        status_code=str(response.status_code),
    ).inc()
    API_LATENCY.labels(
        method=request.method,
        endpoint=path,
    ).observe(elapsed)
    return response

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


class PrHeadFileContent(BaseModel):
    """Full file text on the PR head ref — used by the Healer for verbatim search strings."""

    path: str
    content: str


class RunHealerRequest(BaseModel):
    repo_url: str
    changed_files: list[str] = []
    target_url: str
    branch: str | None = "main"
    git_diff: str | None = None
    test_results: list[dict[str, Any]]
    session_id: str | None = None
    force_mock: bool = False
    pr_head_file_contents: list[PrHeadFileContent] = []


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


@app.get("/metrics")
async def prometheus_metrics():
    """Expose Prometheus metrics for scraping."""
    return Response(
        content=generate_latest(REGISTRY),
        media_type=CONTENT_TYPE_LATEST,
    )


@app.get("/prom/query")
async def prom_query_proxy(query: str = "", timeout: str = "30s"):
    """
    Lightweight PromQL-compatible query endpoint.
    Returns metrics in a Prometheus-API-compatible JSON envelope so the
    Next.js frontend can render native charts WITHOUT needing a separate
    Prometheus server running.
    """
    from prometheus_client.parser import text_string_to_metric_families

    raw = generate_latest(REGISTRY).decode("utf-8")
    results = []

    for family in text_string_to_metric_families(raw):
        if query and query not in family.name:
            continue
        for sample in family.samples:
            results.append({
                "metric": {
                    "__name__": sample.name,
                    **{k: v for k, v in (sample.labels or {}).items()},
                },
                "value": [int(time.time()), str(sample.value)],
            })

    return {
        "status": "success",
        "data": {
            "resultType": "vector",
            "result": results,
        },
    }


@app.post("/generate-test-plan", response_model=GenerateTestPlanResponse)
async def generate_test_plan(request: GenerateTestPlanRequest):
    """
    Generate a test plan using the Architect agent.
    
    Runs the LangGraph Architect node with the provided code context.
    Falls back to mock mode if no LLM API key is configured.
    """
    start = time.time()
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

        # Record Prometheus metrics
        elapsed = time.time() - start
        TEST_PLAN_DURATION.observe(elapsed)
        AGENT_STEP_DURATION.labels(agent="architect").observe(elapsed)
        rag_matches = int(result.get("rag_architect_matches", 0))
        # Count every Architect invocation (vector search may return 0 matches)
        RAG_QUERIES.labels(agent="architect").inc()
        if rag_matches > 0:
            RAG_MATCHES.labels(agent="architect").observe(rag_matches)

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
            rag_architect_matches=rag_matches,
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
    start = time.time()
    ACTIVE_PIPELINES.inc()
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
            initial_state["test_results"] = request.test_results
            graph = _healer_graph
        else:
            graph = _phase1_graph

        result = graph.invoke(initial_state)

        # ── Prometheus: record pipeline metrics ──
        elapsed = time.time() - start
        PIPELINE_RUNS.labels(status="completed").inc()
        PIPELINE_DURATION.observe(elapsed)

        # Record test results
        test_results = result.get("test_results") or []
        passed = sum(1 for t in test_results if t.get("status") == "passed")
        failed = sum(1 for t in test_results if t.get("status") != "passed")
        TESTS_TOTAL.labels(result="passed").inc(passed)
        TESTS_TOTAL.labels(result="failed").inc(failed)
        TESTS_PER_RUN.observe(len(test_results))

        # Record healer metrics
        decision = str(result.get("decision", ""))
        confidence = result.get("confidence_score")
        if confidence is not None:
            HEALER_CONFIDENCE.set(float(confidence))
            HEALER_RUNS.labels(decision=decision).inc()

        return RunPipelineResponse(
            session_id=str(result.get("session_id", "")),
            decision=decision,
            test_plan=str(result.get("test_plan", "")),
            test_results=test_results,
            rca_type=result.get("rca_type"),
            rca_report=result.get("rca_report"),
            proposed_fix=result.get("proposed_fix"),
            proposed_patch=result.get("proposed_patch"),
            confidence_score=confidence,
            fix_branch=result.get("fix_branch"),
            target_files=result.get("target_files"),
            dispatch_action=result.get("dispatch_action"),
            dispatch_result_type=result.get("dispatch_result_type"),
            dispatch_result_url=result.get("dispatch_result_url"),
            dispatch_result_number=result.get("dispatch_result_number"),
        )

    except Exception as e:
        PIPELINE_RUNS.labels(status="failed").inc()
        PIPELINE_DURATION.observe(time.time() - start)
        raise HTTPException(status_code=500, detail=f"Pipeline execution failed: {e}")
    finally:
        ACTIVE_PIPELINES.dec()


@app.post("/run-healer", response_model=RunHealerResponse)
async def run_healer(request: RunHealerRequest):
    """
    Run only the Healer agent (RCA + proposed fix) without courier actions.

    Uses the healer-only graph: decision → healer → END.
    Returns the RCA analysis and proposed patch so the caller can bundle
    code fixes into a unified PR alongside test scripts.
    """
    start = time.time()
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
            "pr_head_file_contents": [
                {"path": item.path.strip(), "content": item.content}
                for item in request.pr_head_file_contents
                if item.path.strip()
            ],
        }

        result = _healer_only_graph.invoke(initial_state)

        # ── Prometheus: record healer metrics ──
        elapsed = time.time() - start
        AGENT_STEP_DURATION.labels(agent="healer").observe(elapsed)
        decision = str(result.get("decision", ""))
        confidence = result.get("confidence_score")
        if confidence is not None:
            HEALER_CONFIDENCE.set(float(confidence))
        HEALER_RUNS.labels(decision=decision).inc()
        rag_matches = int(result.get("rag_healer_matches", 0))
        RAG_QUERIES.labels(agent="healer").inc()
        if rag_matches > 0:
            RAG_MATCHES.labels(agent="healer").observe(rag_matches)

        raw_edits = result.get("file_edits") or []
        file_edits = [
            FileEdit(file=e["file"], search=e["search"], replace=e["replace"])
            for e in raw_edits
            if isinstance(e, dict) and e.get("file") and e.get("search") and "replace" in e
        ]

        return RunHealerResponse(
            session_id=str(result.get("session_id", "")),
            decision=decision,
            rca_type=result.get("rca_type"),
            rca_report=result.get("rca_report"),
            proposed_fix=result.get("proposed_fix"),
            proposed_patch=result.get("proposed_patch"),
            file_edits=file_edits if file_edits else None,
            confidence_score=confidence,
            fix_branch=result.get("fix_branch"),
            target_files=result.get("target_files"),
            rag_healer_matches=rag_matches,
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
    # Wall-clock ms for full Next.js TollGate run (optional) — feeds pipeline duration histogram
    pipeline_duration_ms: int | None = None


@app.post("/store-fix")
async def store_fix(request: StoreFixRequest):
    """Store a successful fix + test plan in the vector DB for future RAG retrieval."""
    import asyncio

    from memory.store import store_fix_from_api, store_test_plan

    data = request.model_dump()

    # Next.js orchestrator does not call POST /run-pipeline; record the same counters here
    # so /metrics reflects Repos → Start pipeline runs (Playwright totals + completion).
    passed = int(request.passed_tests or 0)
    failed = int(request.failed_tests_count or 0)
    total = int(request.total_tests or (passed + failed))
    if total > 0:
        TESTS_TOTAL.labels(result="passed").inc(passed)
        TESTS_TOTAL.labels(result="failed").inc(failed)
        TESTS_PER_RUN.observe(total)
    status = "completed" if failed == 0 else "failed"
    PIPELINE_RUNS.labels(status=status).inc()
    if request.pipeline_duration_ms and request.pipeline_duration_ms > 0:
        PIPELINE_DURATION.observe(request.pipeline_duration_ms / 1000.0)

    # Run both embeddings+inserts in parallel — halves wall time vs sequential calls.
    fix_stored, plan_stored = await asyncio.gather(
        asyncio.to_thread(store_fix_from_api, data),
        asyncio.to_thread(store_test_plan, data),
    )

    return {
        "fix_stored": fix_stored,
        "plan_stored": plan_stored,
        "message": "Stored in RAG" if (fix_stored or plan_stored) else "Storage skipped (check MONGODB_URI/OPENAI_API_KEY)",
    }


# ── Server Entry Point ──────────────────────────────────────────────────────

if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    host = os.getenv("HOST", "0.0.0.0")

    print(f"[*] Starting TollGate AI Engine on {host}:{port}")
    print(f"    LLM Provider: {os.getenv('LLM_PROVIDER', 'openai')}")
    print(f"    Docs: http://{host}:{port}/docs")
    print(f"    Metrics: http://{host}:{port}/metrics")

    uvicorn.run(
        app,
        host=host,
        port=port,
        log_level="info",
    )
