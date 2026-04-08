import { NextRequest, NextResponse } from "next/server";
import { parsePipelineSlackMeta } from "@/lib/integrations/slack-pipeline";
import { applyPipelineWebhook, getPipelineSnapshot } from "@/lib/pipeline/state";
import type { StepId } from "@/lib/pipeline/types";

export const dynamic = "force-dynamic";

const STEP_IDS: StepId[] = [
  "code_push",
  "architect",
  "scripter",
  "tests_gate",
  "courier",
  "watchdog",
  "healer",
  "confidence_gate",
  "ship",
  "block",
];

function isStepId(s: string): s is StepId {
  return (STEP_IDS as string[]).includes(s);
}

/**
 * Per-agent webhook: POST /api/agent/pipeline/webhook/architect
 * Body is the same as the generic webhook except step is implied by the path.
 */
export async function POST(request: NextRequest, ctx: { params: Promise<{ step: string }> }) {
  const { step: stepParam } = await ctx.params;
  const stepSlug = stepParam?.toLowerCase() ?? "";

  if (!isStepId(stepSlug)) {
    return NextResponse.json(
      { error: `Unknown step "${stepParam}".`, valid: STEP_IDS },
      { status: 400 },
    );
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const result = applyPipelineWebhook({
      secret: typeof body.secret === "string" ? body.secret : undefined,
      step: stepSlug,
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
      slack: parsePipelineSlackMeta(body.slack),
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 401 });
    }
    return NextResponse.json({ ok: true, step: stepSlug, state: getPipelineSnapshot() });
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
}
