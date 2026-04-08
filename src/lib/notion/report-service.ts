// ============================================================================
// TollGate — Notion Report Service
//
// Every meaningful agent event gets written to a Notion database page:
//   - Test failures detected by Watchdog
//   - Root cause analysis from Healer
//   - Code fixes and generated diffs
//   - PR / Issue creation by Courier
//   - Pipeline start / completion
//
// Database schema (must exist in Notion before use):
//   Title       (title)
//   Repo        (rich_text)
//   Agent       (select)   — architect | scripter | watchdog | healer | courier | pipeline
//   Event       (select)   — Pipeline Start | Test Failure | Anomaly Detected |
//                             Root Cause Found | Fix Generated | PR Created |
//                             Issue Created | Pipeline Complete
//   Confidence  (number)   — 0.0–1.0
//   PR Link     (url)
//   Status      (select)   — In Progress | Fixed | Needs Review | Failed
//   (optional) Date column — set NOTION_DATE_PROPERTY to its *exact* Notion name
//     (type: Date). If unset, no date property is sent (avoids “property does not exist”).
// ============================================================================

import { Client, APIErrorCode, isNotionClientError } from "@notionhq/client";

// ── Input schema ─────────────────────────────────────────────────────────────

export type NotionAgent =
  | "architect"
  | "scripter"
  | "watchdog"
  | "healer"
  | "courier"
  | "pipeline";

export type NotionEvent =
  | "Pipeline Start"
  | "Test Failure"
  | "Anomaly Detected"
  | "Root Cause Found"
  | "Fix Generated"
  | "PR Created"
  | "Issue Created"
  | "Pipeline Complete";

export type NotionStatus =
  | "In Progress"
  | "Fixed"
  | "Needs Review"
  | "Failed";

export interface DebugReportInput {
  /** Page title shown in Notion — e.g. "Login Failure Fix" */
  title: string;
  /** Repo name — e.g. "Hack-karo" */
  repo: string;
  /** Which agent generated this report */
  agent: NotionAgent;
  /** What event triggered this report */
  event: NotionEvent;
  /** AI confidence score 0–1 (used for healer outputs) */
  confidence?: number;
  /** GitHub PR or Issue URL */
  pr?: string;
  /** Current status of the item */
  status?: NotionStatus;
  /** Raw test failure logs */
  logs?: string;
  /** Root cause analysis explanation */
  rootCause?: string;
  /** Code diff / proposed fix */
  codeDiff?: string;
  /** Any extra freeform context (JSON or markdown) */
  context?: string;
  /** Session ID from orchestrator */
  sessionId?: string;
}

export interface DebugReportResult {
  success: boolean;
  pageId?: string;
  pageUrl?: string;
  error?: string;
}

// ── Singleton client ─────────────────────────────────────────────────────────

function createNotionClient(): Client | null {
  const token = process.env.NOTION_TOKEN;
  if (!token) return null;
  return new Client({ auth: token });
}

/** Optional date column — must match a Date property in the Notion database. */
function notionDateProperties():
  | Record<string, { date: { start: string } }>
  | undefined {
  const name = process.env.NOTION_DATE_PROPERTY?.trim();
  if (!name) return undefined;
  // Avoid legacy default "Timestamp" — many DBs have no property with that exact name.
  if (name.toLowerCase() === "timestamp") return undefined;
  return { [name]: { date: { start: new Date().toISOString() } } };
}

/** True when Notion rejects a database property (e.g. wrong NOTION_DATE_PROPERTY name). */
function shouldRetryNotionCreateWithoutDateProps(err: unknown): boolean {
  if (!isNotionClientError(err)) return false;
  if (err.code !== APIErrorCode.ValidationError) return false;
  const m = err.message.toLowerCase();
  return m.includes("is not a property") || m.includes("not a property that exists");
}

// ── Main service function ─────────────────────────────────────────────────────

/**
 * Creates a structured Notion page inside the TollGate database.
 *
 * Appends rich content blocks to the page after creation:
 *   - Bug/Event heading
 *   - Agent info
 *   - Test failure logs (code block)
 *   - Root cause analysis
 *   - Proposed code fix (diff)
 *   - PR / Issue link
 *   - Confidence score
 */
export async function createDebugReport(
  data: DebugReportInput
): Promise<DebugReportResult> {
  const notion = createNotionClient();
  const databaseId = process.env.NOTION_DATABASE_ID;

  if (!notion) {
    return { success: false, error: "NOTION_TOKEN is not configured" };
  }
  if (!databaseId) {
    return { success: false, error: "NOTION_DATABASE_ID is not configured" };
  }

  try {
    // ── 1. Create the database page ─────────────────────────────────────────
    const dateProps = notionDateProperties() ?? {};
    const properties: Parameters<typeof notion.pages.create>[0]["properties"] = {
      Name: {
        title: [{ text: { content: data.title } }],
      },
      Repo: {
        rich_text: [{ text: { content: data.repo } }],
      },
      Agent: {
        select: { name: capitalise(data.agent) },
      },
      Event: {
        select: { name: data.event },
      },
      ...(data.confidence !== undefined && {
        Confidence: {
          number: parseFloat(data.confidence.toFixed(2)),
        },
      }),
      ...(data.pr && {
        "PR Link": {
          url: data.pr,
        },
      }),
      Status: {
        select: { name: data.status ?? defaultStatus(data.event) },
      },
    };

    let page: Awaited<ReturnType<typeof notion.pages.create>>;
    try {
      page = await notion.pages.create({
        parent: { database_id: databaseId },
        properties: { ...properties, ...dateProps },
      });
    } catch (firstErr) {
      if (
        Object.keys(dateProps).length > 0 &&
        shouldRetryNotionCreateWithoutDateProps(firstErr)
      ) {
        console.warn(
          "[Notion] Date property rejected — retrying without NOTION_DATE_PROPERTY. Check the exact Date column name in Notion.",
        );
        page = await notion.pages.create({
          parent: { database_id: databaseId },
          properties,
        });
      } else {
        throw firstErr;
      }
    }

    const pageId = page.id;
    const pageUrl = (page as { url?: string }).url;

    // ── 2. Build rich content blocks ─────────────────────────────────────────
    const blocks = buildPageBlocks(data);

    // Notion API max 100 blocks per append — chunk if needed
    const CHUNK = 100;
    for (let i = 0; i < blocks.length; i += CHUNK) {
      await notion.blocks.children.append({
        block_id: pageId,
        children: blocks.slice(i, i + CHUNK) as Parameters<
          typeof notion.blocks.children.append
        >[0]["children"],
      });
    }

    console.log(`[Notion] ✅ Created page "${data.title}" → ${pageUrl ?? pageId}`);

    return { success: true, pageId, pageUrl };
  } catch (err) {
    const message = getErrorMessage(err);
    console.error(`[Notion] ❌ Failed to create report: ${message}`);
    return { success: false, error: message };
  }
}

// ── Block builder ─────────────────────────────────────────────────────────────

function buildPageBlocks(data: DebugReportInput): object[] {
  const blocks: object[] = [];

  // ── Banner heading ─────────────────────────────────────────────────────────
  blocks.push(heading2(`🛡️ TollGate Debug Report`));
  blocks.push(paragraph(`**Repo:** ${data.repo}   |   **Agent:** ${capitalise(data.agent)}   |   **Event:** ${data.event}   |   **Session:** ${data.sessionId ?? "—"}`));
  blocks.push(divider());

  // ── Event section ──────────────────────────────────────────────────────────
  blocks.push(heading2(`${eventEmoji(data.event)} ${data.event}`));
  blocks.push(paragraph(`**Agent responsible:** ${capitalise(data.agent)}`));

  // ── Logs ───────────────────────────────────────────────────────────────────
  if (data.logs) {
    blocks.push(heading2("📋 Test Failure Logs"));
    // Split into ≤2000-char code blocks (Notion limit per block)
    for (const chunk of splitText(data.logs, 1900)) {
      blocks.push(codeBlock(chunk, "plain text"));
    }
    blocks.push(divider());
  }

  // ── Root cause ─────────────────────────────────────────────────────────────
  if (data.rootCause) {
    blocks.push(heading2("🔍 Root Cause Analysis"));
    for (const chunk of splitText(data.rootCause, 1900)) {
      blocks.push(paragraph(chunk));
    }
    blocks.push(divider());
  }

  // ── Code diff ──────────────────────────────────────────────────────────────
  if (data.codeDiff) {
    blocks.push(heading2("🔧 Proposed Code Fix"));
    for (const chunk of splitText(data.codeDiff, 1900)) {
      blocks.push(codeBlock(chunk, "diff"));
    }
    blocks.push(divider());
  }

  // ── PR / Issue link ────────────────────────────────────────────────────────
  if (data.pr) {
    blocks.push(heading2("🔗 GitHub Pull Request / Issue"));
    blocks.push(paragraph(data.pr));
    blocks.push(divider());
  }

  // ── Confidence score ───────────────────────────────────────────────────────
  if (data.confidence !== undefined) {
    blocks.push(heading2("📊 Confidence Score"));
    const pct = (data.confidence * 100).toFixed(0);
    const bar = confidenceBar(data.confidence);
    blocks.push(paragraph(`${bar}  **${pct}%** confidence`));
    blocks.push(paragraph(data.confidence >= 0.8
      ? "✅ High confidence — PR auto-generated"
      : "⚠️ Low confidence — GitHub Issue filed for human review"
    ));
    blocks.push(divider());
  }

  // ── Extra context ──────────────────────────────────────────────────────────
  if (data.context) {
    blocks.push(heading2("🗂️ Additional Context"));
    for (const chunk of splitText(data.context, 1900)) {
      blocks.push(codeBlock(chunk, "json"));
    }
  }

  // ── Footer ─────────────────────────────────────────────────────────────────
  blocks.push(divider());
  blocks.push(paragraph(`_Generated by TollGate at ${new Date().toISOString()}_`));

  return blocks;
}

// ── Block helpers ─────────────────────────────────────────────────────────────

function heading2(text: string) {
  return {
    object: "block",
    type: "heading_2",
    heading_2: {
      rich_text: [{ type: "text", text: { content: text } }],
    },
  };
}

function paragraph(text: string) {
  return {
    object: "block",
    type: "paragraph",
    paragraph: {
      rich_text: [{ type: "text", text: { content: text } }],
    },
  };
}

function codeBlock(text: string, language = "plain text") {
  return {
    object: "block",
    type: "code",
    code: {
      language,
      rich_text: [{ type: "text", text: { content: text } }],
    },
  };
}

function divider() {
  return { object: "block", type: "divider", divider: {} };
}

// ── Utility helpers ───────────────────────────────────────────────────────────

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function defaultStatus(event: NotionEvent): NotionStatus {
  if (event === "Pipeline Complete" || event === "PR Created" || event === "Fix Generated") return "Fixed";
  if (event === "Test Failure" || event === "Anomaly Detected") return "Failed";
  if (event === "Issue Created" || event === "Root Cause Found") return "Needs Review";
  return "In Progress";
}

function eventEmoji(event: NotionEvent): string {
  const map: Record<NotionEvent, string> = {
    "Pipeline Start": "🚀",
    "Test Failure": "❌",
    "Anomaly Detected": "⚠️",
    "Root Cause Found": "🔍",
    "Fix Generated": "🔧",
    "PR Created": "🔗",
    "Issue Created": "📌",
    "Pipeline Complete": "✅",
  };
  return map[event] ?? "📋";
}

function confidenceBar(score: number): string {
  const filled = Math.round(score * 10);
  return "█".repeat(filled) + "░".repeat(10 - filled);
}

/** Split long text into chunks of at most `max` characters, breaking on newlines. */
function splitText(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > max) {
    let cut = remaining.lastIndexOf("\n", max);
    if (cut === -1) cut = max;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut);
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

function getErrorMessage(err: unknown): string {
  if (isNotionClientError(err)) {
    const code = err.code;
    if (code === APIErrorCode.ObjectNotFound)
      return "Notion database not found — check NOTION_DATABASE_ID";
    if (code === APIErrorCode.Unauthorized)
      return "Notion unauthorized — check NOTION_TOKEN and integration permissions";
    return `Notion API error: ${err.message}`;
  }
  return err instanceof Error ? err.message : String(err);
}

// ── Convenience wrappers ──────────────────────────────────────────────────────

/** Called at the very start of a pipeline run */
export async function reportPipelineStart(
  repo: string,
  sessionId: string
): Promise<DebugReportResult> {
  return createDebugReport({
    title: `[${repo}] Pipeline Started — ${new Date().toLocaleDateString()}`,
    repo,
    agent: "pipeline",
    event: "Pipeline Start",
    status: "In Progress",
    sessionId,
    context: JSON.stringify({ sessionId, startedAt: new Date().toISOString() }, null, 2),
  });
}

/** Called when Watchdog / test runner detects failures */
export async function reportTestFailure(
  repo: string,
  sessionId: string,
  failedCount: number,
  totalCount: number,
  logs: string
): Promise<DebugReportResult> {
  return createDebugReport({
    title: `[${repo}] Test Failure — ${failedCount}/${totalCount} failed`,
    repo,
    agent: "watchdog",
    event: "Test Failure",
    status: "Failed",
    sessionId,
    logs,
    context: JSON.stringify({ failedCount, totalCount }, null, 2),
  });
}

/** Called when Healer produces a root cause + fix */
export async function reportHealerFix(
  repo: string,
  sessionId: string,
  rootCause: string,
  codeDiff: string,
  confidence: number,
  prUrl?: string
): Promise<DebugReportResult> {
  return createDebugReport({
    title: `[${repo}] Healer Fix — ${(confidence * 100).toFixed(0)}% confidence`,
    repo,
    agent: "healer",
    event: confidence >= 0.8 ? "Fix Generated" : "Root Cause Found",
    status: confidence >= 0.8 ? "Fixed" : "Needs Review",
    confidence,
    pr: prUrl,
    sessionId,
    rootCause,
    codeDiff,
  });
}

/** Called when Courier creates a PR */
export async function reportPRCreated(
  repo: string,
  sessionId: string,
  prUrl: string,
  prNumber: number | undefined,
  confidence: number
): Promise<DebugReportResult> {
  return createDebugReport({
    title: `[${repo}] PR #${prNumber ?? "?"} Created by Courier`,
    repo,
    agent: "courier",
    event: "PR Created",
    status: "Needs Review",
    confidence,
    pr: prUrl,
    sessionId,
  });
}

/** Called when Courier creates a GitHub Issue (low confidence) */
export async function reportIssueCreated(
  repo: string,
  sessionId: string,
  issueUrl: string,
  issueNumber: number | undefined
): Promise<DebugReportResult> {
  return createDebugReport({
    title: `[${repo}] Issue #${issueNumber ?? "?"} Filed by Courier`,
    repo,
    agent: "courier",
    event: "Issue Created",
    status: "Needs Review",
    pr: issueUrl,
    sessionId,
  });
}

/** Called when a pipeline run completes successfully */
export async function reportPipelineComplete(
  repo: string,
  sessionId: string,
  passed: number,
  total: number,
  durationMs: number,
  prUrl?: string
): Promise<DebugReportResult> {
  return createDebugReport({
    title: `[${repo}] Pipeline Complete — ${passed}/${total} passed`,
    repo,
    agent: "pipeline",
    event: "Pipeline Complete",
    status: passed === total ? "Fixed" : "Needs Review",
    pr: prUrl,
    sessionId,
    context: JSON.stringify({ passed, total, failed: total - passed, durationMs }, null, 2),
  });
}
