import { NextRequest, NextResponse } from "next/server";
import { parsePipelineSlackMeta } from "@/lib/integrations/slack-pipeline";
import { applyPipelineWebhook, getPipelineSnapshot } from "@/lib/pipeline/state";

export const dynamic = "force-dynamic";

/** Public docs for wiring external agents (GET). */
export async function GET() {
  const secretConfigured = Boolean(process.env.PIPELINE_WEBHOOK_SECRET?.trim());
  return NextResponse.json({
    method: "POST",
    path: "/api/agent/pipeline/webhook",
    perStepPath: "/api/agent/pipeline/webhook/{step}",
    description:
      "Call from each AI agent or orchestrator when a pipeline step starts, completes, or fails. Optionally send log lines. Use /webhook/architect (etc.) so the step is implied by the URL.",
    authentication: secretConfigured
      ? "Send JSON field secret matching PIPELINE_WEBHOOK_SECRET."
      : "No secret configured — set PIPELINE_WEBHOOK_SECRET in production.",
    bodyFields: {
      secret: "string (optional unless env is set)",
      step: "code_push | architect | scripter | tests_gate | courier | watchdog | healer | confidence_gate | ship | block",
      status: "idle | running | completed | failed",
      message: "string (optional) — appended to live terminal",
      path: "courier | watchdog — when completing tests_gate",
      outcome: "ship | block — when completing confidence_gate",
      branch: "success | failure — alias for routing gates",
      action: "reset — clears run (honors secret if configured)",
      slack:
        "optional object: { repo, branch, targetUrl, prNumber, sessionId, durationMs, passed, failed, failedSteps: [{step, error}], runKind } — enriches Slack Block Kit alerts",
    },
    env: {
      SLACK_PIPELINE_WEBHOOK_URL: "Incoming Webhook URL for pipeline notifications (falls back to SLACK_WEBHOOK_URL)",
      PIPELINE_SLACK_APP_LABEL: "Header label in Slack (default TollGate)",
      PIPELINE_SLACK_DEFAULT_REPO: "Default repo line if omitted in slack payload",
      PIPELINE_SLACK_DEFAULT_BRANCH: "Default branch",
      PIPELINE_SLACK_TARGET_URL: "Default target URL for tests",
    },
    example: {
      step: "architect",
      status: "completed",
      message: "Plan approved: 4 tasks, estimated 45s",
    },
    current: getPipelineSnapshot(),
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const result = applyPipelineWebhook({
      secret: typeof body.secret === "string" ? body.secret : undefined,
      step: typeof body.step === "string" ? body.step : undefined,
      status:
        body.status === "idle" ||
        body.status === "running" ||
        body.status === "completed" ||
        body.status === "failed"
          ? body.status
          : undefined,
      message: typeof body.message === "string" ? body.message : undefined,
      branch:
        body.branch === "success" || body.branch === "failure" ? body.branch : undefined,
      path: body.path === "courier" || body.path === "watchdog" ? body.path : undefined,
      outcome: body.outcome === "ship" || body.outcome === "block" ? body.outcome : undefined,
      action: body.action === "reset" ? "reset" : undefined,
      slack: parsePipelineSlackMeta(body.slack),
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 401 });
    }
    return NextResponse.json({ ok: true, state: getPipelineSnapshot() });
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
}
