import { NextResponse } from "next/server";
import { applyPipelineWebhook, resetPipeline } from "@/lib/pipeline/state";
import type { PipelineSlackMeta } from "@/lib/pipeline/types";

export const dynamic = "force-dynamic";

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const demoSlack: PipelineSlackMeta = {
  repo: "harshkg23/sample-dashboard-app",
  branch: "main",
  targetUrl: "http://localhost:5173",
  prNumber: 6,
  runKind: "Manual pipeline run triggered",
};

const demoSlackFailure: PipelineSlackMeta = {
  ...demoSlack,
  sessionId: "pipeline_demo_1773475519207",
  durationMs: 1300,
  passed: 2,
  failed: 2,
  failedSteps: [
    {
      step: "Step 2: Assert page contains element with data-testid \"recent-activity-title\"",
      error: 'Assertion failed: page does not contain "element with data-testid \\"recent-activity-title\\""',
    },
    {
      step: "Step 4: Assert page contains \"Recent Activity\"",
      error: "Assertion failed: page does not contain \"Recent Activity\"",
    },
  ],
};

/**
 * Demo sequence for local UX — external agents replace this by calling /webhook directly.
 */
export async function POST() {
  void (async () => {
    resetPipeline();
    await wait(400);

    const sequence: Array<Parameters<typeof applyPipelineWebhook>[0] & { delay: number }> = [
      {
        delay: 200,
        step: "code_push",
        status: "running",
        message: "Webhook: push received on main",
        slack: demoSlack,
      },
      { delay: 600, step: "code_push", status: "completed", slack: demoSlack },
      {
        delay: 400,
        step: "architect",
        status: "running",
        message: "The Architect: decomposing change set…",
        slack: demoSlack,
      },
      {
        delay: 900,
        step: "architect",
        status: "completed",
        message: "The Architect: plan ready (4 steps).",
        slack: demoSlack,
      },
      {
        delay: 350,
        step: "scripter",
        status: "running",
        message: "The Scripter: launching Playwright MCP…",
        slack: demoSlack,
      },
      {
        delay: 1100,
        step: "scripter",
        status: "completed",
        message: "The Scripter: suite finished (3 flaky, 0 hard fails).",
        slack: demoSlack,
      },
      { delay: 300, step: "tests_gate", status: "running", message: "Evaluating test gate…", slack: demoSlack },
      {
        delay: 700,
        step: "tests_gate",
        status: "completed",
        path: "watchdog",
        branch: "failure",
        message: "Tests failed — routing to Watchdog path",
        slack: demoSlackFailure,
      },
      {
        delay: 400,
        step: "watchdog",
        status: "running",
        message: "The Watchdog: paging SRE channel",
        slack: demoSlack,
      },
      { delay: 800, step: "watchdog", status: "completed", slack: demoSlack },
      {
        delay: 350,
        step: "healer",
        status: "running",
        message: "The Healer: generating patch from trace…",
        slack: demoSlack,
      },
      {
        delay: 1000,
        step: "healer",
        status: "completed",
        message: "The Healer: patch confidence 86%",
        slack: demoSlack,
      },
      { delay: 300, step: "confidence_gate", status: "running", slack: demoSlack },
      {
        delay: 600,
        step: "confidence_gate",
        status: "completed",
        outcome: "ship",
        branch: "success",
        message: "Confidence > 80% — opening PR / merge queue",
        slack: demoSlack,
      },
      {
        delay: 400,
        step: "ship",
        status: "running",
        message: "Posting GitHub status + Slack Courier",
        slack: demoSlack,
      },
      {
        delay: 500,
        step: "ship",
        status: "completed",
        message: "Courier: All clear — notified #engineering",
        slack: demoSlack,
      },
    ];

    for (const { delay, ...ev } of sequence) {
      await wait(delay);
      applyPipelineWebhook(ev);
    }
  })();

  return NextResponse.json({ ok: true, message: "Simulation started." });
}
