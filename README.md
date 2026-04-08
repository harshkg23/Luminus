<div align="center">
  <h1>TollGate</h1>
  <p><strong>AI-Powered Code Review Co-Pilot</strong></p>
  <p>
    <img src="https://img.shields.io/badge/version-0.1.0-blue?style=flat-square" />
    <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" />
    <img src="https://img.shields.io/badge/Next.js-16.2.2-black?style=flat-square&logo=nextdotjs" />
    <img src="https://img.shields.io/badge/Python-3.11-3776AB?style=flat-square&logo=python&logoColor=white" />
    <img src="https://img.shields.io/badge/LangGraph-Multi--Agent-f59e0b?style=flat-square" />
    <img src="https://img.shields.io/badge/Notion-Activity%20Log-000?style=flat-square&logo=notion" />
    <img src="https://img.shields.io/badge/status-active-brightgreen?style=flat-square" />
  </p>
  <br />
  <p><em>TollGate is a production-grade, multi-agent AI system that autonomously reviews pull requests, detects code vulnerabilities, generates test plans, and self-heals failing code — logging every action to Notion and Slack in real time.</em></p>
</div>

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Agent Pipeline](#agent-pipeline)
  - [The Architect](#1-the-architect)
  - [The Scripter](#2-the-scripter)
  - [The Watchdog](#3-the-watchdog)
  - [The Healer](#4-the-healer)
  - [The Courier](#5-the-courier)
- [AST Code Analysis](#ast-code-analysis)
- [Notion Activity Timeline](#notion-activity-timeline)
- [Slack Notifications](#slack-notifications)
- [GitHub MCP Integration](#github-mcp-integration)
- [Pipeline Webhook API](#pipeline-webhook-api)
- [Live Dashboard](#live-dashboard)
- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [Roadmap](#roadmap)
- [Tech Stack](#tech-stack)

---

## Overview

TollGate sits between your code and production. The moment a pull request is opened, TollGate's agent pipeline activates — analyzing diffs, generating test plans, running tests, healing failures, and dispatching results to GitHub, Slack, and Notion. It replaces the manual review bottleneck with a fully automated, observable, and auditable quality gate.

### Key Capabilities

- **Multi-agent orchestration** via LangGraph — six specialized agents coordinated in a directed acyclic graph
- **AST-based static analysis** — deep vulnerability detection beyond pattern matching
- **Self-healing** — the Healer agent performs root cause analysis and proposes patches for failing tests
- **Confidence scoring** — a gating mechanism that ensures automated actions are only taken when the system is sufficiently confident
- **Structured observability** — every pipeline event is logged to Notion and broadcast to Slack

---

## Architecture

```
                     ┌─────────────────────────────────────────────┐
                     │                 TollGate                      │
                     │                                               │
  GitHub / CLI ────▶ │  ┌─────────────────────────────────────┐    │
                     │  │      Next.js 16 Application          │    │
                     │  │   Dashboard · Auth · REST APIs       │    │
                     │  └───────────────┬─────────────────────┘    │
                     │                  │ Webhook                   │
                     │  ┌───────────────▼─────────────────────┐    │
                     │  │     Python LangGraph Agent Engine    │    │
                     │  │                                      │    │
                     │  │   Architect → Scripter → Tests       │    │
                     │  │                 ↓                    │    │
                     │  │       [pass] ←  Decision → [fail]   │    │
                     │  │          ↓                   ↓      │    │
                     │  │        Done              Healer      │    │
                     │  │                              ↓       │    │
                     │  │                     Courier Decision │    │
                     │  │                              ↓       │    │
                     │  │                     Courier Execute  │    │
                     │  └──────────────────────────────────────┘   │
                     │                    ↓                         │
                     │        ┌──────────────────────┐              │
                     │        │  Slack · Notion · GitHub │          │
                     │        └──────────────────────┘              │
                     └─────────────────────────────────────────────┘
```

---

## Agent Pipeline

The agent pipeline is defined as a LangGraph `StateGraph`. Each node is an isolated agent that reads from and writes to a shared state object. Edges and conditional branches determine the execution path.

```python
# agents-orchestration/graph/workflow.py

builder.set_entry_point("architect")
builder.add_edge("architect",     "run_tests")
builder.add_edge("run_tests",     "decision")
builder.add_conditional_edges("decision", route_after_decision, {
    "healer": "healer",
    "done":   END,
})
builder.add_edge("healer",           "courier_decision")
builder.add_edge("courier_decision", "courier_execute")
builder.add_edge("courier_execute",  END)
```

### 1. The Architect

The entry point. The Architect receives the raw `git diff` and the list of changed files, and produces a structured test plan.

**Responsibilities:**
- Classifies changes by risk level — authentication, database migrations, and payment flows receive elevated scrutiny
- Invokes an LLM (OpenAI GPT-4o or Anthropic Claude) with the full diff as context
- Integrates AST analysis findings as additional test assertions
- Falls back to deterministic mock output if no LLM key is configured

**Output:** A YAML-formatted test plan specifying what must be tested, how, and to what degree.

```python
def architect_node(state: SentinelState) -> SentinelState:
    test_plan = llm.generate_test_plan(
        diff=state["git_diff"],
        changed_files=state["changed_files"],
        ast_findings=state.get("ast_findings", []),
    )
    return {"test_plan": test_plan}
```

---

### 2. The Scripter

Takes the Architect's test plan and converts it into executable test scripts.

**Responsibilities:**
- Translates natural language test specifications into runnable code (Playwright, pytest)
- Resolves environment variables and the target application URL
- Generates both unit-level and end-to-end integration tests
- Stores scripts to disk for the Test Runner to execute

---

### 3. The Watchdog

The quality gate. The Watchdog evaluates test results and makes a binary routing decision.

| Decision | Condition | Next Step |
|---|---|---|
| `all_pass` | All tests pass | Pipeline terminates cleanly |
| `has_failures` | One or more tests fail | Routes to the Healer |

```python
def route_after_decision(state: SentinelState) -> str:
    decision = state.get("decision")
    if decision == "has_failures":
        return "healer"
    if decision == "all_pass":
        return "done"
    raise ValueError("state.decision must be 'all_pass' or 'has_failures'")
```

---

### 4. The Healer

When tests fail, the Healer performs automated root cause analysis and proposes a patch.

**Responsibilities:**
- Correlates failing test output with the changed files in the git diff
- Produces a structured RCA report identifying the failure mode
- Generates a code patch targeting the identified root cause
- Assigns a confidence score to the proposed fix

```python
def healer_node(state: SentinelState) -> SentinelState:
    rca = llm.analyze_failure(
        test_results=state["test_results"],
        diff=state["git_diff"],
        code_context=state["code_context"],
    )
    return {
        "rca_report":      rca.report,
        "proposed_fix":    rca.fix,
        "confidence_score": rca.confidence,
    }
```

---

### 5. The Courier

The Courier operates in two phases: **Decision** and **Execute**.

**Courier Decision**

Evaluates the confidence score against a configured threshold and selects an action:

| Outcome | Condition | Action |
|---|---|---|
| `ship` | Confidence ≥ threshold | Create a PR or merge the patch |
| `block` | Confidence < threshold | Open a blocking issue, escalate to humans |

**Courier Execute**

Dispatches the chosen action via the GitHub MCP integration:
- Creates a pull request containing the Healer's proposed patch
- Posts a detailed review comment on the original PR with the RCA report
- Opens a GitHub Issue for tracking when the pipeline blocks
- Fires `PR Created` or `Issue Created` events to Notion and Slack

---

## AST Code Analysis

TollGate's AST engine parses source files into Abstract Syntax Trees and runs a suite of semantic analysis passes. This goes significantly beyond regex or string matching — the engine understands code structure, data flow, and scope.

### How It Works

Rather than reading code as text, the AST engine parses it into a traversable tree of semantic nodes:

```
FunctionDeclaration: getUserData
├── params: [userId]
└── body
    └── VariableDeclaration
        └── CallExpression: db.query
            └── TemplateLiteral          ← potential SQL injection vector
                └── Expression: userId   ← unsanitized user input
```

By traversing this tree, TollGate can trace the flow of user-controlled data through the application and flag instances where it reaches dangerous sinks without sanitization.

### Detection Capabilities

| Severity | Vulnerability | Detection Method |
|---|---|---|
| Critical | SQL Injection | Template literals in query call arguments with unverified identifiers |
| Critical | XSS | Unsanitized expressions assigned to `innerHTML` or `dangerouslySetInnerHTML` |
| High | Hardcoded Secrets | String literal patterns matching API key formats in variable declarations |
| High | Insecure `eval()` | `CallExpression` to `eval` with non-literal arguments |
| Medium | Unhandled Promise Rejections | `await` expressions outside `try/catch` blocks |
| Medium | `await` Inside Loops | `AwaitExpression` inside `ForStatement` or `WhileStatement` body |
| Low | Unused Variables | Declared identifiers with no downstream references in scope |
| Low | TypeScript `any` Casts | `TSTypeAnnotation` or `TSAsExpression` resolving to `any` |

### Pipeline Integration

AST findings are injected into the Architect's context before test plan generation. This means TollGate does not merely report vulnerabilities — it generates specific tests targeting the detected vulnerability paths and verifies they are addressed.

```
git diff received
      │
      ├── LLM: natural language test plan
      │
      └── AST Engine
            ├── Parse changed files
            ├── Run vulnerability passes
            ├── Score by severity
            └── Append findings to test plan context
```

---

## Notion Activity Timeline

Every meaningful pipeline event creates a structured entry in a Notion database, providing a persistent, searchable audit log of system activity.

### Database Schema

| Property | Type | Description |
|---|---|---|
| `Name` | Title | Human-readable event title in format `[repo] Action — TollGate` |
| `Repo` | Text | Repository identifier |
| `Agent` | Select | Agent responsible for this event |
| `Event` | Select | Event classification |
| `Status` | Select | Current state |
| `Confidence` | Number | LLM confidence score, rounded to two decimal places |
| `PR Link` | URL | GitHub PR URL when applicable |
| `TimeStamp` | Date | ISO 8601 timestamp |

### Event Reference

| Event | Trigger | Default Status |
|---|---|---|
| `Pipeline Start` | `code_push` → `running` | In Progress |
| `Pipeline Complete` | `ship` → `completed` | Fixed |
| `Pipeline Failed` | Any step → `failed` | Failed |
| `Review Completed` | `tests_gate` → `completed` (pass) | Needs Review |
| `Test Failure` | `tests_gate` → `completed` (fail) | Failed |
| `PR Created` | `courier` → `completed` | Needs Review |
| `Issue Created` | Courier blocks | Needs Review |

### Agent Reference

`pipeline` · `architect` · `scripter` · `watchdog` · `healer` · `courier` · `reviewer`

### Implementation

The logging layer is fully decoupled from the pipeline. `logEvent()` is a fire-and-forget wrapper — Notion failures are silently caught and never propagate to the agent runtime.

```typescript
// src/lib/integrations/notion.ts

export function logEvent(input: NotionReportInput): void {
  void createNotionReport(input).catch(() => {});
}
```

Integration points in the pipeline state machine automatically construct titles, map the step to the correct agent and event type, and resolve metadata from the webhook body:

```typescript
logEvent({
  title:  `[${repo}] Architect started — TollGate`,
  repo,
  agent:  "architect",
  event:  "Pipeline Start",
  context: body.message,
});
```

---

## Slack Notifications

TollGate sends Slack Block Kit messages at each significant pipeline step via an Incoming Webhook.

### Notification Reference

| Step | Trigger | Content |
|---|---|---|
| Pipeline started | `code_push` running | Repository, branch, target URL, start time |
| Agent active | Any agent running | Agent name and current activity |
| Tests failed | `tests_gate` failure | Fail/pass counts, per-step breakdown, session ID |
| Tests passed | `tests_gate` success | Confirmation, repository, branch |
| Pipeline complete | `ship` completed | Repository, branch, release signal |
| Confidence gate failed | `confidence_gate` blocked | Threshold message, escalation prompt |

### Configuration

```env
SLACK_PIPELINE_WEBHOOK_URL=https://hooks.slack.com/services/xxx/yyy/zzz
PIPELINE_SLACK_APP_LABEL=TollGate
PIPELINE_SLACK_DEFAULT_REPO=owner/repo
PIPELINE_SLACK_DEFAULT_BRANCH=main
PIPELINE_SLACK_TARGET_URL=https://staging.example.com
```

---

## GitHub MCP Integration

TollGate communicates with GitHub via the **Model Context Protocol** server, providing structured tool access to the GitHub API without REST rate-limit complexity.

The MCP client spawns a subprocess (`@modelcontextprotocol/server-github`) and communicates over JSON-RPC via stdin/stdout.

```typescript
const client = new GitHubMCPClient();
await client.start("npx");

const pullRequests = await client.listPullRequests("owner", "repo", "open");
```

**Supported operations:** List pull requests · Create pull requests · Post review comments · Open issues

---

## Pipeline Webhook API

Agents and external orchestrators report their status by posting to the pipeline webhook endpoint. This decouples the agent runtime from the Next.js frontend and enables distributed execution.

**Endpoint:** `POST /api/agent/pipeline/webhook`

### Request

```json
{
  "step":    "architect",
  "status":  "completed",
  "message": "Generated test plan: 8 test cases across 3 files",
  "slack": {
    "repo":   "owner/repo",
    "branch": "feature/auth",
    "passed": 8,
    "failed": 0
  },
  "notion": {
    "confidence": 0.91,
    "prLink": "https://github.com/owner/repo/pull/104"
  }
}
```

### Step Values

| Step | Description |
|---|---|
| `code_push` | Pipeline initiation |
| `architect` | Test plan generation |
| `scripter` | Test script generation |
| `tests_gate` | Test execution and evaluation |
| `watchdog` | Result analysis |
| `healer` | Root cause analysis and patch |
| `confidence_gate` | Confidence threshold evaluation |
| `courier` | GitHub action dispatch |
| `ship` | Successful completion |
| `block` | Escalation / hold |

### Response

```json
{
  "ok": true,
  "state": {
    "steps": { "architect": "completed", "scripter": "idle" },
    "logs": [{ "ts": "...", "level": "success", "message": "...", "step": "architect" }],
    "updatedAt": 1775671558018
  }
}
```

For convenience, per-step routes are also available: `POST /api/agent/pipeline/webhook/{step}`

---

## Live Dashboard

The Next.js frontend provides a real-time pipeline visualization interface:

- **Pipeline graph** — nodes and edges animate as agents report status
- **Live terminal** — streams every agent log message via Server-Sent Events (`/api/agent/pipeline/events`)
- **Step status indicators** — idle / running / completed / failed states with visual differentiation
- **Metrics view** — historical pipeline run data and agent performance

---

## Quick Start

### Prerequisites

| Requirement | Version |
|---|---|
| Node.js | 20+ |
| Python | 3.11+ |
| MongoDB | Any (local or Atlas) |

### Installation

```bash
git clone https://github.com/harshkg23/Luminus.git
cd Luminus
npm install
```

### Environment Configuration

```bash
cp .env.example .env
```

```env
# Application
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<generate with: openssl rand -base64 32>
MONGODB_URI=mongodb://localhost:27017/tollgate

# LLM Provider (choose one)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
LLM_PROVIDER=openai

# GitHub
GITHUB_PERSONAL_ACCESS_TOKEN=ghp_...

# Notion
NOTION_TOKEN=ntn_...
NOTION_DATABASE_ID=<32-character database ID>

# Slack
SLACK_PIPELINE_WEBHOOK_URL=https://hooks.slack.com/services/...
PIPELINE_SLACK_APP_LABEL=TollGate
PIPELINE_SLACK_DEFAULT_REPO=owner/repo

# Pipeline Security
PIPELINE_WEBHOOK_SECRET=<generate with: openssl rand -hex 32>
TARGET_URL=http://localhost:3000
```

### Running Locally

```bash
# Terminal 1 — Next.js frontend
npm run dev

# Terminal 2 — Python agent engine
cd agents-orchestration
pip install -r requirements.txt
python main.py
```

### Verify Setup

```bash
# 1. Confirm Notion credentials are loaded
curl http://localhost:3000/api/notion/health

# 2. Create a test Notion entry
curl -X POST http://localhost:3000/api/notion/health

# 3. Send a test Slack notification
curl -X POST http://localhost:3000/api/integrations/slack/test
```

---

## Testing the Pipeline

Simulate a complete pipeline run through the webhook API:

```bash
BASE="http://localhost:3000/api/agent/pipeline/webhook"
HEADERS='-H "Content-Type: application/json"'
REPO="owner/repo"

# Pipeline start
curl -s -X POST $BASE $HEADERS \
  -d "{\"step\":\"code_push\",\"status\":\"running\",\"slack\":{\"repo\":\"$REPO\",\"branch\":\"main\"}}"

# Architect completes
curl -s -X POST $BASE $HEADERS \
  -d "{\"step\":\"architect\",\"status\":\"completed\",\"message\":\"Generated 8 test cases\"}"

# Tests fail
curl -s -X POST $BASE $HEADERS \
  -d "{\"step\":\"tests_gate\",\"status\":\"completed\",\"branch\":\"failure\",\"slack\":{\"repo\":\"$REPO\",\"failed\":3,\"passed\":5},\"notion\":{\"confidence\":0.38}}"

# Healer applies patch
curl -s -X POST $BASE $HEADERS \
  -d "{\"step\":\"healer\",\"status\":\"completed\",\"message\":\"Patch applied to src/auth/handler.ts\"}"

# Ship
curl -s -X POST $BASE $HEADERS \
  -d "{\"step\":\"ship\",\"status\":\"completed\",\"notion\":{\"prLink\":\"https://github.com/$REPO/pull/104\"}}"
```

Each command produces a Notion entry, a Slack notification, and a live dashboard update simultaneously.

---

## Project Structure

```
Luminus/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── agent/
│   │   │   │   ├── pipeline/
│   │   │   │   │   ├── webhook/            ← Primary pipeline webhook (POST / GET)
│   │   │   │   │   ├── webhook/[step]/     ← Per-step convenience routes
│   │   │   │   │   ├── events/             ← Server-Sent Events stream
│   │   │   │   │   └── simulate/           ← Simulation endpoint for testing
│   │   │   │   ├── debug-report/           ← Manual Notion log endpoint
│   │   │   │   └── pull-requests/          ← GitHub PR list via MCP
│   │   │   ├── notion/
│   │   │   │   └── health/                 ← Notion connectivity check + test entry
│   │   │   └── integrations/
│   │   │       └── slack/test/             ← Slack webhook test fire
│   │   ├── dashboard/                      ← Main application dashboard
│   │   ├── pipeline/                       ← Live pipeline visualization
│   │   ├── prs/                            ← Pull request browser
│   │   ├── metrics/                        ← Historical metrics view
│   │   └── settings/                       ← Configuration UI
│   └── lib/
│       ├── integrations/
│       │   ├── notion.ts                   ← Notion activity logger
│       │   ├── slack-pipeline.ts           ← Slack Block Kit message builder
│       │   ├── slack.ts                    ← Slack utilities and helpers
│       │   └── github-mcp.ts              ← GitHub MCP JSON-RPC client
│       ├── pipeline/
│       │   ├── state.ts                    ← Pipeline state machine + webhook handler
│       │   └── types.ts                    ← Shared TypeScript types
│       └── auth.ts                         ← NextAuth configuration
│
└── agents-orchestration/                   ← Python LangGraph engine
    ├── graph/
    │   ├── workflow.py                     ← LangGraph StateGraph definition
    │   └── state.py                        ← Shared agent state schema
    ├── nodes/
    │   ├── architect.py                    ← Test plan generation
    │   ├── healer.py                       ← RCA and patch generation
    │   ├── courier_decision.py             ← Confidence gate and routing
    │   ├── courier_execute.py              ← GitHub PR / issue dispatch
    │   ├── run_tests.py                    ← Test execution
    │   └── decision.py                     ← Pass / fail routing logic
    ├── sentinel/                           ← Phase 1 graph (FastAPI mode)
    ├── server.py                           ← FastAPI HTTP server
    └── main.py                             ← CLI entry point
```

---

## Roadmap

### In Progress

- [ ] **AST Analysis Engine** — tree-sitter integration for language-aware vulnerability detection across Python and TypeScript
- [ ] **Prometheus Metrics** — per-agent execution time, failure rates, and confidence score distribution

### Planned

- [ ] **Confidence Threshold Tuning** — fine-tune scoring thresholds using aggregated production data
- [ ] **Inline PR Comments** — surface Healer fix suggestions directly within GitHub PR review threads
- [ ] **Multi-Repository Support** — per-repository pipeline configurations and isolated state management
- [ ] **Role-Based Access Control** — team-level RBAC on the dashboard with audit logging
- [ ] **On-Demand Re-analysis** — trigger pipeline re-runs without requiring a new git push
- [ ] **Webhook Signature Verification** — HMAC-based GitHub webhook validation for production security

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, TypeScript, Tailwind CSS |
| Authentication | NextAuth v4, MongoDB Adapter |
| Database | MongoDB, Mongoose |
| Agent Engine | Python 3.11, LangGraph, FastAPI, Uvicorn |
| LLM | OpenAI GPT-4o, Anthropic Claude |
| Static Analysis | tree-sitter, acorn *(planned)* |
| Notifications | Slack Incoming Webhooks, Block Kit |
| Activity Log | Notion API (`@notionhq/client`) |
| GitHub | Model Context Protocol (`@modelcontextprotocol/server-github`) |
| Observability | Prometheus + custom agent metrics *(planned)* |

---

## License

MIT License. See [LICENSE](LICENSE) for details.

---

<div align="center">
  <sub>Built at RNSIT Hackathon 2026</sub>
</div>
