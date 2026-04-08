"""
FastAPI server for SentinelQA AI Engine.

Exposes HTTP endpoints that call the LangGraph pipeline.
"""

import os
from typing import Any

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from sentinel.graph import build_phase1_graph
from sentinel.state import SentinelState

load_dotenv()

app = FastAPI(
    title="SentinelQA AI Engine",
    version="1.0.0",
    description="LangGraph-powered test generation and analysis service",
)

# Compile the graph once at startup — reused for every request
_phase1_graph = build_phase1_graph()

# ── Request/Response Models ─────────────────────────────────────────────────


class GenerateTestPlanRequest(BaseModel):
    code_context: str
    changed_files: list[str]
    target_url: str
    repo_url: str | None = None
    branch: str | None = "main"
    commit_sha: str | None = None


class GenerateTestPlanResponse(BaseModel):
    test_plan: str
    provider: str  # "mock" | "openai" | "anthropic"


class AnalyzeFailureRequest(BaseModel):
    test_results: list[dict[str, Any]]
    code_context: str
    diff: str


class AnalyzeFailureResponse(BaseModel):
    rca_report: str
    proposed_fix: str
    confidence: float


# ── Endpoints ───────────────────────────────────────────────────────────────


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    provider = os.getenv("LLM_PROVIDER", "openai")
    has_openai_key = bool(os.getenv("OPENAI_API_KEY", "").strip())
    has_anthropic_key = bool(os.getenv("ANTHROPIC_API_KEY", "").strip())

    return {
        "status": "healthy",
        "service": "sentinelqa-ai-engine",
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
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Graph execution failed: {e}")


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


# ── Server Entry Point ──────────────────────────────────────────────────────

if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    host = os.getenv("HOST", "0.0.0.0")

    print(f"🚀 Starting SentinelQA AI Engine on {host}:{port}")
    print(f"   LLM Provider: {os.getenv('LLM_PROVIDER', 'openai')}")
    print(f"   Docs: http://{host}:{port}/docs")

    uvicorn.run(
        app,
        host=host,
        port=port,
        log_level="info",
    )
