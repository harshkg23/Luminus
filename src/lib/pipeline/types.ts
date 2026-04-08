export type StepStatus = "idle" | "running" | "completed" | "failed";

export type StepId =
  | "code_push"
  | "architect"
  | "scripter"
  | "tests_gate"
  | "courier"
  | "watchdog"
  | "healer"
  | "confidence_gate"
  | "ship"
  | "block";

export type PipelineSnapshot = {
  steps: Record<StepId, StepStatus>;
  afterTests: "courier" | "watchdog" | null;
  afterConfidence: "ship" | "block" | null;
  logs: Array<{
    ts: string;
    level: "info" | "success" | "error" | "warn";
    message: string;
    step?: string;
  }>;
  updatedAt: number;
};

/** Optional rich context for Slack — pass as `slack` on the pipeline webhook body. */
export type PipelineSlackMeta = {
  repo?: string;
  branch?: string;
  targetUrl?: string;
  prNumber?: number;
  sessionId?: string;
  durationMs?: number;
  passed?: number;
  failed?: number;
  failedSteps?: Array<{ step: string; error: string }>;
  /** e.g. "Manual pipeline run triggered" */
  runKind?: string;
};
