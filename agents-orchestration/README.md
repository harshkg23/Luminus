# AI Engine (Aaskar)

This folder contains the Python LangGraph service for SentinelQA.

Current workflow:
`Architect -> Run Tests -> Decision`

Phase 1 established the graph structure. Phase 2 connects the `run_tests` node to the existing Next.js backend route `POST /api/agent/run-tests`.

## Structure
```text
ai-engine/
  nodes/
    architect.py
    run_tests.py
    decision.py
  graph/
    state.py
    workflow.py
  llm/
    client.py
  main.py
  verify_phase1.py
```

## Setup
```bash
cd ai-engine
python -m venv .venv
# Windows PowerShell
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
```

## Run
```bash
python main.py
python main.py --mock-tests
python main.py --mock-tests --all-pass
python verify_phase1.py

# FastAPI server (production mode)
python server.py
# Access docs at http://localhost:8000/docs
```

## Phase 2 Runtime Modes

### Real backend mode
Default mode is API-backed test execution.

Prerequisites:
- Next.js app is running
- `POST /api/agent/run-tests` is reachable
- `TARGET_URL` points at the app under test

Required `.env` values:
```env
RUN_TESTS_MODE=api
SENTINEL_BACKEND_URL=http://localhost:3000
TARGET_URL=http://localhost:3000
RUN_TESTS_TIMEOUT_SECONDS=60
```

### Mock test mode
Use mock test mode only for local graph verification when backend execution is unavailable.

```bash
python main.py --mock-tests
```

## Endpoints

### `GET /health`
Health check. Returns LLM provider status.

### `POST /generate-test-plan`
Generate a test plan from code context.
```json
{
  "code_context": "...",
  "changed_files": ["src/app/page.tsx"],
  "target_url": "http://localhost:3000",
  "repo_url": "owner/repo",
  "branch": "main"
}
```

### `POST /analyze-failure`
Analyze test failures. Healer agent is still TODO.

## LLM Provider Config
Default provider is OpenAI.

`.env` example:
```env
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

If no key is available, Architect falls back to a deterministic mock plan.

## Notes
`main.py` is the single local workflow runner.
`verify_phase1.py` remains the verification entrypoint name, but it now validates the Phase 2 graph as well.
