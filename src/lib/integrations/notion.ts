import "server-only";
import { Client } from "@notionhq/client";

export type NotionAgent = "pipeline" | "reviewer" | "courier";
export type NotionEvent =
  | "Pipeline Start"
  | "Review Completed"
  | "Slack Notified"
  | "Pipeline Failed";

interface NotionReportInput {
  title: string;
  repo: string;
  agent: NotionAgent;
  event: NotionEvent;
  confidence?: number;
  prLink?: string;
  status?: "In Progress" | "Fixed" | "Needs Review" | "Failed";
  context?: string;
}

function getNotionClient(): Client | null {
  if (!process.env.NOTION_TOKEN) return null;
  return new Client({ auth: process.env.NOTION_TOKEN });
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
        Timestamp: {
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
