import { NextRequest, NextResponse } from "next/server";
import { createNotionReport, type NotionAgent, type NotionEvent } from "@/lib/integrations/notion";

const validAgents: NotionAgent[] = ["pipeline", "reviewer", "courier"];
const validEvents: NotionEvent[] = [
  "Pipeline Start",
  "Review Completed",
  "Slack Notified",
  "Pipeline Failed",
];

export async function POST(request: NextRequest) {
  let body: {
    title?: string;
    repo?: string;
    agent?: NotionAgent;
    event?: NotionEvent;
    confidence?: number;
    prLink?: string;
    status?: "In Progress" | "Fixed" | "Needs Review" | "Failed";
    context?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.title || !body.repo || !body.agent || !body.event) {
    return NextResponse.json(
      { error: "Missing required fields: title, repo, agent, event" },
      { status: 400 },
    );
  }

  if (!validAgents.includes(body.agent) || !validEvents.includes(body.event)) {
    return NextResponse.json(
      { error: "Invalid agent/event value" },
      { status: 400 },
    );
  }

  const result = await createNotionReport({
    title: body.title,
    repo: body.repo,
    agent: body.agent,
    event: body.event,
    confidence: body.confidence,
    prLink: body.prLink,
    status: body.status,
    context: body.context,
  });

  if (!result.success) return NextResponse.json(result, { status: 502 });
  return NextResponse.json(result, { status: 201 });
}
