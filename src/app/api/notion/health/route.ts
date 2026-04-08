import { NextResponse } from "next/server";
import { createNotionReport } from "@/lib/integrations/notion";

export const dynamic = "force-dynamic";

export async function GET() {
  const configured = Boolean(process.env.NOTION_TOKEN && process.env.NOTION_DATABASE_ID);
  return NextResponse.json({
    configured,
    token: Boolean(process.env.NOTION_TOKEN),
    databaseId: process.env.NOTION_DATABASE_ID ? "set" : "missing",
  });
}

export async function POST() {
  const result = await createNotionReport({
    title: `[TollGate] Health Check — ${new Date().toISOString()}`,
    repo: process.env.PIPELINE_SLACK_DEFAULT_REPO || "luminus/local",
    agent: "architect",
    event: "Pipeline Start",
    status: "In Progress",
    context: JSON.stringify({ source: "POST /api/notion/health" }, null, 2),
  });

  if (!result.success) {
    return NextResponse.json(result, { status: 502 });
  }

  return NextResponse.json(result, { status: 201 });
}
