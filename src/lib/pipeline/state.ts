import { notifyPipelineSlack } from "@/lib/integrations/slack-pipeline";
import type { PipelineSlackMeta, PipelineSnapshot } from "./types";

const initialSnapshot = (): PipelineSnapshot => ({
  steps: {
    code_push: "idle",
    architect: "idle",
    scripter: "idle",
    tests_gate: "idle",
    courier: "idle",
    watchdog: "idle",
    healer: "idle",
    confidence_gate: "idle",
    ship: "idle",
    block: "idle",
  },
  afterTests: null,
  afterConfidence: null,
  logs: [],
  updatedAt: Date.now(),
});

let snapshot: PipelineSnapshot = initialSnapshot();

const listeners = new Set<() => void>();

export function getPipelineSnapshot(): PipelineSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as PipelineSnapshot;
}

function emit() {
  snapshot.updatedAt = Date.now();
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* noop */
    }
  });
}

export function subscribePipeline(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function pushLog(level: PipelineSnapshot["logs"][0]["level"], message: string, step?: string) {
  snapshot.logs.push({
    ts: new Date().toISOString(),
    level,
    message,
    step,
  });
  if (snapshot.logs.length > 500) snapshot.logs.splice(0, snapshot.logs.length - 500);
}

/** Edge target `to` is considered completed for glow when this returns true. */
export function isStepCompleted(step: keyof PipelineSnapshot["steps"]): boolean {
  return snapshot.steps[step] === "completed";
}

export function resetPipeline(): void {
  snapshot = initialSnapshot();
  pushLog("info", "Pipeline reset — waiting for agents.");
  emit();
}

type WebhookBody = {
  secret?: string;
  step?: string;
  status?: "idle" | "running" | "completed" | "failed";
  message?: string;
  branch?: "success" | "failure";
  /** after tests_gate: which path is active */
  path?: "courier" | "watchdog";
  /** after confidence_gate */
  outcome?: "ship" | "block";
  action?: "reset";
  /** Rich context for Slack Block Kit notifications */
  slack?: PipelineSlackMeta;
};

function verifySecret(secret: string | undefined): boolean {
  const expected = process.env.PIPELINE_WEBHOOK_SECRET?.trim();
  if (!expected) return true;
  return secret === expected;
}

export function applyPipelineWebhook(body: WebhookBody): { ok: true } | { ok: false; error: string } {
  if (body.action === "reset") {
    resetPipeline();
    return { ok: true };
  }

  if (!verifySecret(body.secret)) {
    return { ok: false, error: "Invalid webhook secret." };
  }

  if (body.message) {
    pushLog(
      body.status === "failed" ? "error" : "info",
      body.message,
      body.step,
    );
  }

  const step = body.step as keyof PipelineSnapshot["steps"] | undefined;
  const status = body.status;

  if (step && status && step in snapshot.steps) {
    snapshot.steps[step] = status;
    if (!body.message) {
      pushLog(
        status === "failed" ? "error" : status === "running" ? "info" : "success",
        `[${step}] ${status}`,
        step,
      );
    }

    if (step === "tests_gate" && status === "completed") {
      if (body.path === "courier") snapshot.afterTests = "courier";
      else if (body.path === "watchdog") snapshot.afterTests = "watchdog";
      else if (body.branch === "success") snapshot.afterTests = "courier";
      else if (body.branch === "failure") snapshot.afterTests = "watchdog";
    }

    if (step === "confidence_gate" && status === "completed") {
      if (body.outcome === "ship") snapshot.afterConfidence = "ship";
      else if (body.outcome === "block") snapshot.afterConfidence = "block";
      else if (body.branch === "success") snapshot.afterConfidence = "ship";
      else if (body.branch === "failure") snapshot.afterConfidence = "block";
    }

    notifyPipelineSlack({
      step,
      status,
      message: body.message,
      path: body.path,
      branch: body.branch,
      outcome: body.outcome,
      slack: body.slack,
    });
  }

  emit();
  return { ok: true };
}
