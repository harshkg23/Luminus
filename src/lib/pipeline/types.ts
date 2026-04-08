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
