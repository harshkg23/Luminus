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

export interface LogEntry {
  ts: string;
  step?: string;
  level?: "info" | "warn" | "error" | "success";
  message: string;
}

export interface PipelineSnapshot {
  steps: Record<StepId, StepStatus>;
  afterTests: string | null;
  afterConfidence: string | null;
  logs: LogEntry[];
  updatedAt: number;
}

/** Optional rich context for Slack — pass as `slack` on the pipeline webhook body. */
export interface PipelineSlackMeta {
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
}

