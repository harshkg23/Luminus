<div align="center">

<img src="https://img.shields.io/badge/TollGate-AI%20Code%20Review-6366f1?style=for-the-badge&logo=github&logoColor=white" />
<img src="https://img.shields.io/badge/Status-Active-22c55e?style=for-the-badge" />
<img src="https://img.shields.io/badge/Next.js-16.2.2-000000?style=for-the-badge&logo=nextdotjs" />
<img src="https://img.shields.io/badge/LangGraph-Multi--Agent-f59e0b?style=for-the-badge" />
<img src="https://img.shields.io/badge/Notion-Activity%20Log-000000?style=for-the-badge&logo=notion" />

```
████████╗ ██████╗ ██╗     ██╗      ██████╗  █████╗ ████████╗███████╗
╚══██╔══╝██╔═══██╗██║     ██║     ██╔════╝ ██╔══██╗╚══██╔══╝██╔════╝
   ██║   ██║   ██║██║     ██║     ██║  ███╗███████║   ██║   █████╗  
   ██║   ██║   ██║██║     ██║     ██║   ██║██╔══██║   ██║   ██╔══╝  
   ██║   ╚██████╔╝███████╗███████╗╚██████╔╝██║  ██║   ██║   ███████╗
   ╚═╝    ╚═════╝ ╚══════╝╚══════╝ ╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚══════╝
```

### 🚦 AI-Powered Code Review Co-Pilot — Built for Hackathons, Designed for Production

[🌐 Live Demo](#) · [📖 Docs](#architecture) · [🐛 Issues](https://github.com/harshkg23/Luminus/issues) · [⚡ Quick Start](#quick-start)

</div>

---

## 🤔 What is TollGate?

> **TollGate** is an intelligent, multi-agent code review system that acts as a **co-pilot** for your engineering team. The moment a pull request is opened, TollGate's agent pipeline wakes up — analyzing diffs, generating test plans, detecting vulnerabilities via AST analysis, healing failing code, and delivering structured reports straight to GitHub, Slack, and Notion.

No more waiting for a senior engineer to have time. No more blind merges. TollGate is the **automated quality gate** standing between your code and production.

---

## ✨ Feature Highlights

| Feature | Description |
|---|---|
| 🤖 **Multi-Agent Pipeline** | 6 specialized AI agents coordinate in a LangGraph workflow |
| 🌳 **AST Code Analysis** | Deep static analysis using Abstract Syntax Trees for vulnerability detection |
| 📓 **Notion Activity Timeline** | Every pipeline event auto-logs to a structured Notion database |
| 💬 **Slack Block Kit Alerts** | Rich, formatted Slack notifications at every pipeline step |
| 🔗 **GitHub MCP Integration** | Reads PRs, posts review comments, creates issues natively |
| 📊 **Live Dashboard** | Real-time pipeline visualization with step-by-step status |
| 🎯 **Confidence Scoring** | LLM confidence gate before any automated action is taken |
| 🩹 **Self-Healing** | Healer agent proposes and applies patches for failing tests |
| 🔒 **Auth** | Secure user auth via NextAuth + MongoDB |

---

## 🏗️ Architecture

```
                        ┌─────────────────────────────────────────────────┐
                        │                  TollGate System                 │
                        │                                                   │
  GitHub Webhook ──────▶│  ┌─────────────────────────────────────────┐    │
  (PR Opened)           │  │         Next.js 16 App (Frontend)        │    │
                        │  │  Dashboard · Auth · Pipeline UI · APIs   │    │
                        │  └────────────────┬────────────────────────┘    │
                        │                   │ HTTP Webhook                 │
                        │  ┌────────────────▼────────────────────────┐    │
                        │  │     Python LangGraph Agent Engine        │    │
                        │  │                                          │    │
                        │  │  ┌──────────┐    ┌──────────────────┐   │    │
                        │  │  │Architect │───▶│    Scripter      │   │    │
                        │  │  └──────────┘    └────────┬─────────┘   │    │
                        │  │       ↑                   │             │    │
                        │  │  AST Analysis          Run Tests        │    │
                        │  │       ↑                   │             │    │
                        │  │  ┌────┴─────┐    ┌────────▼─────────┐  │    │
                        │  │  │Watchdog  │◀───│   Test Runner    │  │    │
                        │  │  └────┬─────┘    └──────────────────┘  │    │
                        │  │       │ (failures detected)             │    │
                        │  │  ┌────▼─────┐    ┌──────────────────┐  │    │
                        │  │  │  Healer  │───▶│Courier Decision  │  │    │
                        │  │  └──────────┘    └────────┬─────────┘  │    │
                        │  │                           │             │    │
                        │  │                  ┌────────▼─────────┐  │    │
                        │  │                  │ Courier Execute  │  │    │
                        │  │                  │ PR·Issue·Patch   │  │    │
                        │  │                  └──────────────────┘  │    │
                        │  └──────────────────────────────────────  │    │
                        │                   │                        │    │
                        │         ┌─────────┼────────────┐           │    │
                        │         ▼         ▼            ▼           │    │
                        │      Slack     Notion       GitHub         │    │
                        └─────────────────────────────────────────────────┘
```

---

## 🤖 The Agent Pipeline — Deep Dive

### 1. 🏛️ The Architect
The entry point of every pipeline run. The Architect receives the raw git diff and changed file list, then produces a comprehensive **test plan**.

- Calls an LLM (OpenAI or Anthropic) with the full code diff as context
- Classifies changes by risk level (auth, payments, DB migrations = high risk)
- Outputs a structured YAML test plan specifying what needs to be tested, how, and why
- Falls back to mock mode if no LLM API key is configured

```python
# nodes/architect.py
def architect_node(state: SentinelState) -> SentinelState:
    test_plan = llm.generate_test_plan(
        diff=state["git_diff"],
        changed_files=state["changed_files"]
    )
    return {"test_plan": test_plan}
```

---

### 2. 📝 The Scripter
Takes the Architect's test plan and converts it into **executable test scripts** (Playwright, pytest, etc.).

- Translates natural language test cases into runnable code
- Respects the target URL and environment variables
- Generates both unit and integration style tests
- Stores scripts for the Test Runner to execute

---

### 3. 🐕 The Watchdog
The quality gate. After tests run, the Watchdog evaluates results and makes a **binary decision**:

| Outcome | Meaning |
|---|---|
| `all_pass` | Pipeline continues to Courier — clean merge |
| `has_failures` | Pipeline routes to Healer — intervention required |

```python
def route_after_decision(state: SentinelState) -> str:
    if state["decision"] == "has_failures":
        return "healer"
    if state["decision"] == "all_pass":
        return "done"
```

---

### 4. 🩹 The Healer
When tests fail, the Healer performs **automated root cause analysis**:

- Correlates failing test output with the changed files from the diff
- Generates a structured RCA report with confidence score
- Proposes a patch that fixes the failing tests
- The patch is validated before the Courier dispatches it

```python
# nodes/healer.py
def healer_node(state: SentinelState) -> SentinelState:
    rca = llm.analyze_failure(
        test_results=state["test_results"],
        diff=state["git_diff"],
        code_context=state["code_context"]
    )
    return {
        "rca_report": rca.report,
        "proposed_fix": rca.fix,
        "confidence_score": rca.confidence
    }
```

---

### 5. 📦 The Courier (Decision + Execute)
Runs in two phases:

**Courier Decision:** Evaluates the confidence score against a threshold. Routes to:
- `ship` → Create PR / merge / comment on GitHub
- `block` → Escalate, create a blocking issue, notify humans

**Courier Execute:** Takes the chosen action:
- Creates a GitHub Pull Request with the patch
- Posts a detailed review comment on the original PR
- Opens a GitHub Issue for tracking
- Fires `PR Created` / `Issue Created` events to Notion and Slack

---

## 🌳 AST-Based Code Analysis

> One of TollGate's most powerful (and upcoming) capabilities is **AST (Abstract Syntax Tree) analysis** — a technique that goes far beyond string-matching to deeply understand your code's structure.

### What is AST Analysis?

Instead of reading code as text, AST analysis **parses code into a tree of semantic nodes**:

```
FunctionDeclaration
├── id: Identifier (name: "getUserData")
├── params: [Identifier (name: "userId")]
└── body: BlockStatement
    ├── VariableDeclaration
    │   └── CallExpression
    │       ├── callee: MemberExpression (db.query)
    │       └── args: [TemplateLiteral]  ← ⚠️ SQL INJECTION RISK
    └── ReturnStatement
```

### Why TollGate Uses AST

| Traditional Regex/Text | AST Analysis |
|---|---|
| Catches obvious patterns | Understands code semantics |
| High false positive rate | Low false positive rate |
| Can't track variable flow | Tracks data flow across scopes |
| Misses obfuscated code | Parses all valid syntax |

### What TollGate's AST Engine Detects

- 🔴 **SQL Injection** — template literals passed directly into DB queries
- 🔴 **XSS Vulnerabilities** — unsanitized user input rendered as HTML
- 🟠 **Hardcoded Secrets** — API keys, passwords in string literals
- 🟠 **Insecure `eval()` usage** — dynamic code execution from user input
- 🟡 **Unused Variables** — dead code that bloats bundles
- 🟡 **Circular Dependencies** — import chains that cause runtime issues
- 🟡 **Async anti-patterns** — `await` inside loops, unhandled promise rejections
- 🔵 **Type Safety Gaps** — `any` casts that bypass TypeScript's safety net

### AST Integration in Pipeline

```
Architect Node
     │
     ├── LLM Test Plan Generation
     │
     └── AST Analysis Engine ◀── Changed files from git diff
              │
              ├── Parse each file into AST (using tree-sitter / acorn)
              ├── Run vulnerability detector passes
              ├── Score severity (critical / high / medium / low)
              └── Inject findings into test plan as additional assertions
```

The AST findings are appended to the Architect's output so the Scripter can generate specific tests targeting the detected vulnerability paths. This means TollGate doesn't just find issues — it **tests for them automatically**.

---

## 📓 Notion Activity Timeline

Every pipeline event is automatically logged to a Notion database as a structured entry — creating a live **activity dashboard** for the entire system.

### Database Schema

| Property | Type | Description |
|---|---|---|
| `Name` | Title | Human-readable event title |
| `Repo` | Text | Repository name |
| `Agent` | Select | Which agent fired this event |
| `Event` | Select | Event type |
| `Status` | Select | Current state of this entry |
| `Confidence` | Number | LLM confidence score (0.00–1.00) |
| `PR Link` | URL | Link to GitHub PR if applicable |
| `TimeStamp` | Date | ISO timestamp of the event |

### Supported Events

| Event | Triggered By | Default Status |
|---|---|---|
| `Pipeline Start` | `code_push` running | In Progress |
| `Pipeline Complete` | `ship` completed | Fixed |
| `Pipeline Failed` | Any step failed | Failed |
| `Review Completed` | `tests_gate` passed | Needs Review |
| `Test Failure` | `tests_gate` failed | Failed |
| `PR Created` | `courier` completed | Needs Review |
| `Issue Created` | `courier` blocked | Needs Review |

### Supported Agents

`pipeline` · `architect` · `scripter` · `watchdog` · `healer` · `courier` · `reviewer`

### Architecture

```typescript
// lib/integrations/notion.ts

// createNotionReport() — core function, creates a Notion page + optional code block
// logEvent()           — fire-and-forget wrapper, never blocks the pipeline
// NotionLogMeta        — optional metadata type for webhook callers
```

The logging is **non-blocking by design** — if Notion is down, errors are silently swallowed:

```typescript
export function logEvent(input: NotionReportInput): void {
  void createNotionReport(input).catch(() => {});
}
```

---

## 💬 Slack Integration

TollGate sends rich **Block Kit** notifications to Slack at every meaningful pipeline step.

### Notification Types

| Step | Message |
|---|---|
| Pipeline started | 🚀 Repo, branch, target URL, started-at |
| Agent running | ⚙️ Agent name + current activity |
| Tests failed | ❌ Failed/total count, per-step breakdown |
| Tests passed | ✅ All checks passed |
| Pipeline complete | 🚀 Shipped / merged |
| Confidence too low | 🚨 Human review required |

### Configuration

```env
SLACK_PIPELINE_WEBHOOK_URL=https://hooks.slack.com/services/xxx
PIPELINE_SLACK_APP_LABEL=TollGate          # header label
PIPELINE_SLACK_DEFAULT_REPO=owner/repo     # fallback repo
PIPELINE_SLACK_TARGET_URL=https://your-app.com
```

---

## 🔗 GitHub MCP Integration

TollGate communicates with GitHub via the **Model Context Protocol (MCP)** server, enabling it to:

- List open pull requests
- Create new PRs with proposed patches
- Post structured review comments
- Open tracking issues on failure

```typescript
const client = new GitHubMCPClient();
await client.start("npx"); // or "docker"
const prs = await client.listPullRequests("owner", "repo", "open");
```

The MCP client spawns a subprocess (`@modelcontextprotocol/server-github` or the Docker image) and communicates via JSON-RPC over stdio, giving TollGate first-class GitHub API access without REST rate limit complexity.

---

## 📡 Pipeline Webhook API

The central nervous system of TollGate. Any agent, script, or external service can report its status by posting to:

```
POST /api/agent/pipeline/webhook
```

### Request Body

```json
{
  "step": "architect",
  "status": "completed",
  "message": "Generated test plan: 8 test cases across 3 files",
  "slack": {
    "repo": "harshkg23/Luminus",
    "branch": "feature/auth",
    "passed": 8,
    "failed": 0
  },
  "notion": {
    "confidence": 0.91,
    "prLink": "https://github.com/harshkg23/Luminus/pull/104"
  }
}
```

### Step Values

`code_push` → `architect` → `scripter` → `tests_gate` → `watchdog` → `healer` → `courier` → `confidence_gate` → `ship` / `block`

### Response

```json
{
  "ok": true,
  "state": {
    "steps": { "architect": "completed", "scripter": "idle", ... },
    "logs": [...],
    "updatedAt": 1775671558018
  }
}
```

---

## 🖥️ Live Dashboard

The Next.js frontend includes a real-time pipeline dashboard that visualizes every step as it executes:

- **Step bubbles** light up green/red/amber as agents report status
- **Live terminal log** streams every agent message in real time
- **Pipeline graph** shows the DAG with animated edge flows
- **Metrics page** for historical analysis

The dashboard subscribes to `GET /api/agent/pipeline/events` (Server-Sent Events) for live updates without polling.

---

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- Python 3.11+
- MongoDB (local or Atlas)
- Notion API token + database
- OpenAI or Anthropic API key

### 1. Clone & Install

```bash
git clone https://github.com/harshkg23/Luminus.git
cd Luminus
npm install
```

### 2. Set Environment Variables

```bash
cp .env.example .env
```

```env
# Auth
NEXTAUTH_SECRET=your-secret
NEXTAUTH_URL=http://localhost:3000
MONGODB_URI=mongodb://localhost:27017/tollgate

# LLM
OPENAI_API_KEY=sk-...
LLM_PROVIDER=openai

# GitHub
GITHUB_PERSONAL_ACCESS_TOKEN=ghp_...

# Notion Activity Log
NOTION_TOKEN=ntn_...
NOTION_DATABASE_ID=your-database-id

# Slack
SLACK_PIPELINE_WEBHOOK_URL=https://hooks.slack.com/...
PIPELINE_SLACK_APP_LABEL=TollGate
PIPELINE_SLACK_DEFAULT_REPO=owner/repo

# Pipeline
PIPELINE_WEBHOOK_SECRET=your-webhook-secret
TARGET_URL=http://localhost:3000
```

### 3. Start the Frontend

```bash
npm run dev
# → http://localhost:3000
```

### 4. Start the Agent Engine

```bash
cd agents-orchestration
pip install -r requirements.txt
python main.py
```

### 5. Verify Notion

```bash
# Check env is configured
curl http://localhost:3000/api/notion/health

# Create a test entry
curl -X POST http://localhost:3000/api/notion/health
```

---

## 🧪 Testing the Pipeline

Trigger the full pipeline manually via webhook:

```bash
# 1. Start pipeline
curl -X POST http://localhost:3000/api/agent/pipeline/webhook \
  -H "Content-Type: application/json" \
  -d '{"step":"code_push","status":"running","slack":{"repo":"harshkg23/Luminus","branch":"main"}}'

# 2. Architect running
curl -X POST http://localhost:3000/api/agent/pipeline/webhook \
  -H "Content-Type: application/json" \
  -d '{"step":"architect","status":"running","message":"Analyzing diff..."}'

# 3. Tests failed
curl -X POST http://localhost:3000/api/agent/pipeline/webhook \
  -H "Content-Type: application/json" \
  -d '{"step":"tests_gate","status":"completed","branch":"failure","notion":{"confidence":0.35},"slack":{"repo":"harshkg23/Luminus","failed":3,"passed":5}}'

# 4. Healer fixing
curl -X POST http://localhost:3000/api/agent/pipeline/webhook \
  -H "Content-Type: application/json" \
  -d '{"step":"healer","status":"completed","message":"Patch applied"}'

# 5. Ship
curl -X POST http://localhost:3000/api/agent/pipeline/webhook \
  -H "Content-Type: application/json" \
  -d '{"step":"ship","status":"completed","notion":{"prLink":"https://github.com/harshkg23/Luminus/pull/104"}}'
```

Each of these creates a Notion entry + Slack notification + updates the live dashboard simultaneously.

---

## 📁 Project Structure

```
Luminus/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── agent/
│   │   │   │   ├── pipeline/
│   │   │   │   │   ├── webhook/route.ts    ← Main pipeline webhook
│   │   │   │   │   ├── events/route.ts     ← SSE live stream
│   │   │   │   │   └── simulate/route.ts   ← Test simulation
│   │   │   │   ├── debug-report/route.ts   ← Manual Notion log
│   │   │   │   └── pull-requests/route.ts  ← GitHub PR list
│   │   │   ├── notion/health/route.ts      ← Notion connectivity check
│   │   │   └── integrations/slack/test/    ← Slack test fire
│   │   ├── dashboard/    ← Main dashboard
│   │   ├── pipeline/     ← Live pipeline view
│   │   ├── prs/          ← PR browser
│   │   └── metrics/      ← Historical metrics
│   └── lib/
│       ├── integrations/
│       │   ├── notion.ts          ← Notion activity logger
│       │   ├── slack-pipeline.ts  ← Slack Block Kit builder
│       │   ├── slack.ts           ← Slack utilities
│       │   └── github-mcp.ts      ← GitHub MCP client
│       └── pipeline/
│           ├── state.ts           ← Pipeline state machine
│           └── types.ts           ← Shared TypeScript types
│
└── agents-orchestration/          ← Python LangGraph engine
    ├── graph/
    │   ├── workflow.py            ← LangGraph DAG definition
    │   └── state.py               ← Agent state schema
    ├── nodes/
    │   ├── architect.py           ← Test plan generation
    │   ├── healer.py              ← RCA + patch generation
    │   ├── courier_decision.py    ← Confidence gate routing
    │   ├── courier_execute.py     ← GitHub actions dispatch
    │   ├── run_tests.py           ← Test execution
    │   └── decision.py            ← Pass/fail routing
    ├── sentinel/                  ← Phase 1 graph (FastAPI mode)
    ├── server.py                  ← FastAPI HTTP server
    └── main.py                    ← CLI entry point
```

---

## 🔮 Roadmap

### In Progress
- [ ] 🌳 **AST Analysis Engine** — tree-sitter/acorn integration for deep vulnerability detection
- [ ] 📊 **Prometheus Metrics** — agent-level performance tracking and observability

### Planned
- [ ] 🎯 **Confidence Threshold Tuning** — fine-tune scoring using real-world test data
- [ ] 💬 **Inline PR Comments** — surface LLM fix suggestions directly in GitHub PR threads
- [ ] 🗂️ **Multi-Repo Support** — per-repo pipeline configs and isolated state
- [ ] 🔐 **RBAC Dashboard** — role-based access control for team environments
- [ ] 🔄 **Re-run on Demand** — trigger pipeline re-analysis without a new push
- [ ] 📱 **Mobile Dashboard** — responsive pipeline monitoring on the go

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, TypeScript, Tailwind CSS |
| Auth | NextAuth v4 + MongoDB Adapter |
| Database | MongoDB + Mongoose |
| Agent Engine | Python 3.11, LangGraph, FastAPI |
| LLM | OpenAI GPT-4o / Anthropic Claude |
| Notifications | Slack Block Kit Webhooks |
| Activity Log | Notion API (`@notionhq/client`) |
| GitHub | MCP Server (`@modelcontextprotocol/server-github`) |
| AST Analysis | tree-sitter / acorn (planned) |
| Observability | Prometheus + custom metrics (planned) |

---

## 👥 Team

Built with ☕, LangGraph, and too many terminal tabs at **RNSIT Hackathon 2026**.

---

<div align="center">

**TollGate** — *Because every line of code deserves a gate.*

⭐ Star this repo if TollGate saved your PR from disaster

</div>
