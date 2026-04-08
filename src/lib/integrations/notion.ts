import "server-only";
import { Client } from "@notionhq/client";

// ── Types ──────────────────────────────────────────────────────────────────

export type NotionAgent =
  | "pipeline"
  | "architect"
  | "scripter"
  | "watchdog"
  | "healer"
  | "courier"
  | "reviewer";

export type NotionEvent =
  | "Pipeline Start"
  | "Pipeline Complete"
  | "Pipeline Failed"
  | "Review Completed"
  | "PR Created"
  | "Issue Created"
  | "Test Failure";

export type NotionStatus = "In Progress" | "Needs Review" | "Fixed" | "Failed";

export interface NotionReportInput {
  title: string;
  repo: string;
  agent: NotionAgent;
  event: NotionEvent;
  confidence?: number;
  prLink?: string;
  status?: NotionStatus;
  context?: string;
}

/** Optional metadata callers can attach to pipeline webhooks for Notion logging. */
export interface NotionLogMeta {
  repo?: string;
  prNumber?: number;
  confidence?: number;
  prLink?: string;
  context?: string;
}

// ── Client ─────────────────────────────────────────────────────────────────

function getNotionClient(): Client | null {
  if (!process.env.NOTION_TOKEN) return null;
  return new Client({ auth: process.env.NOTION_TOKEN });
}

// ── Helpers ────────────────────────────────────────────────────────────────

function defaultStatus(event: NotionEvent): NotionStatus {
  switch (event) {
    case "Pipeline Start":
      return "In Progress";
    case "Pipeline Complete":
      return "Fixed";
    case "Pipeline Failed":
    case "Test Failure":
      return "Failed";
    case "Review Completed":
    case "PR Created":
    case "Issue Created":
      return "Needs Review";
    default:
      return "Needs Review";
  }
}

// ── Core: createNotionReport ───────────────────────────────────────────────

export async function createNotionReport(input: NotionReportInput): Promise<{
  success: boolean;
  pageId?: string;
  pageUrl?: string;
  error?: string;
}> {
  const notion = getNotionClient();
  const databaseId = process.env.NOTION_DATABASE_ID;
  if (!notion) return { success: false, error: "NOTION_TOKEN not set in .env" };
  if (!databaseId) return { success: false, error: "NOTION_DATABASE_ID not set in .env" };

  try {
    const page = await notion.pages.create({
      parent: { database_id: databaseId },
      properties: {
        Name: {
          title: [{ text: { content: input.title } }],
        },
        Repo: {
          rich_text: [{ text: { content: input.repo } }],
        },
        Agent: {
          select: { name: input.agent },
        },
        Event: {
          select: { name: input.event },
        },
        TimeStamp: {
          date: { start: new Date().toISOString() },
        },
        Status: {
          select: { name: input.status ?? defaultStatus(input.event) },
        },
        ...(typeof input.confidence === "number"
          ? {
              Confidence: { number: Number(input.confidence.toFixed(2)) },
            }
          : {}),
        ...(input.prLink ? { "PR Link": { url: input.prLink } } : {}),
      },
    });

    const pageId = page.id;
    const pageUrl = (page as { url?: string }).url;

    // Append context as a code block inside the page body
    if (input.context?.trim()) {
      await notion.blocks.children.append({
        block_id: pageId,
        children: [
          {
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: [{ type: "text", text: { content: "Context" } }],
            },
          },
          {
            object: "block",
            type: "code",
            code: {
              language: "json",
              rich_text: [{ type: "text", text: { content: input.context.slice(0, 1800) } }],
            },
          },
        ],
      });
    }

    return { success: true, pageId, pageUrl };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create Notion page",
    };
  }
}

// ── Pipeline helper: logEvent ──────────────────────────────────────────────

/**
 * Fire-and-forget Notion logger for the TollGate pipeline.
 *
 * Call this wherever a pipeline event occurs. It will never throw or block
 * the caller — errors are silently swallowed so the pipeline is unaffected.
 */
export function logEvent(input: {
  title: string;
  repo: string;
  agent: NotionAgent;
  event: NotionEvent;
  status?: NotionStatus;
  confidence?: number;
  prLink?: string;
  context?: string;
}): void {
  void createNotionReport(input).catch(() => {});
}
