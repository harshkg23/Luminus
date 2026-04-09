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

const globalForPipeline = globalThis as unknown as {
  __pipelineSnapshot: PipelineSnapshot;
  __pipelineListeners: Set<() => void>;
};

if (!globalForPipeline.__pipelineSnapshot) {
  globalForPipeline.__pipelineSnapshot = initialSnapshot();
}
if (!globalForPipeline.__pipelineListeners) {
  globalForPipeline.__pipelineListeners = new Set();
}

const getSnapshotRef = () => globalForPipeline.__pipelineSnapshot;
const getListenersRef = () => globalForPipeline.__pipelineListeners;

export function getPipelineSnapshot(): PipelineSnapshot {
  return JSON.parse(JSON.stringify(getSnapshotRef())) as PipelineSnapshot;
}

function emit() {
  getSnapshotRef().updatedAt = Date.now();
  getListenersRef().forEach((fn) => {
    try {
      fn();
    } catch {
      /* noop */
    }
  });
}

export function subscribePipeline(listener: () => void): () => void {
  getListenersRef().add(listener);
  return () => getListenersRef().delete(listener);
}

function pushLog(level: PipelineSnapshot["logs"][0]["level"], message: string, step?: string) {
  const snap = getSnapshotRef();
  snap.logs.push({
    ts: new Date().toISOString(),
    level,
    message,
    step,
  });
  if (snap.logs.length > 500) snap.logs.splice(0, snap.logs.length - 500);
}

/** Edge target `to` is considered completed for glow when this returns true. */
export function isStepCompleted(step: keyof PipelineSnapshot["steps"]): boolean {
  return getSnapshotRef().steps[step] === "completed";
}

export function resetPipeline(): void {
  globalForPipeline.__pipelineSnapshot = initialSnapshot();
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

  const snap = getSnapshotRef();

  if (step && status && step in snap.steps) {
    snap.steps[step] = status;
    if (!body.message) {
      pushLog(
        status === "failed" ? "error" : status === "running" ? "info" : "success",
        `[${step}] ${status}`,
        step,
      );
    }

    if (step === "tests_gate" && status === "completed") {
      if (body.path === "courier") snap.afterTests = "courier";
      else if (body.path === "watchdog") snap.afterTests = "watchdog";
      else if (body.branch === "success") snap.afterTests = "courier";
      else if (body.branch === "failure") snap.afterTests = "watchdog";
    }

    if (step === "confidence_gate" && status === "completed") {
      if (body.outcome === "ship") snap.afterConfidence = "ship";
      else if (body.outcome === "block") snap.afterConfidence = "block";
      else if (body.branch === "success") snap.afterConfidence = "ship";
      else if (body.branch === "failure") snap.afterConfidence = "block";
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
