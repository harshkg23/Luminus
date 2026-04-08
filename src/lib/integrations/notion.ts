import "server-only";
import { Client, APIErrorCode, isNotionClientError } from "@notionhq/client";

export type NotionAgent = "pipeline" | "reviewer" | "courier";
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

function notionDateProperties():
  | Record<string, { date: { start: string } }>
  | undefined {
  const name = process.env.NOTION_DATE_PROPERTY?.trim();
  if (!name) return undefined;
  if (name.toLowerCase() === "timestamp") return undefined;
  return { [name]: { date: { start: new Date().toISOString() } } };
}

function shouldRetryNotionCreateWithoutDateProps(err: unknown): boolean {
  if (!isNotionClientError(err)) return false;
  if (err.code !== APIErrorCode.ValidationError) return false;
  const m = err.message.toLowerCase();
  return m.includes("is not a property") || m.includes("not a property that exists");
}

function defaultStatus(event: NotionEvent): "In Progress" | "Fixed" | "Needs Review" | "Failed" {
  if (event === "Pipeline Start") return "In Progress";
  if (event === "Pipeline Failed") return "Failed";
  return "Needs Review";
}

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
    const dateProps = notionDateProperties() ?? {};
    const properties: Parameters<typeof notion.pages.create>[0]["properties"] = {
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
      Status: {
        select: { name: input.status ?? defaultStatus(input.event) },
      },
      ...(typeof input.confidence === "number"
        ? {
            Confidence: { number: Number(input.confidence.toFixed(2)) },
          }
        : {}),
      ...(input.prLink ? { "PR Link": { url: input.prLink } } : {}),
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
          "[Notion] Date property rejected — retrying without NOTION_DATE_PROPERTY.",
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
