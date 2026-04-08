// ============================================================================
// TollGate — WebSocket Event Types
//
// Defines all real-time events emitted during pipeline execution.
// Used by the server-side emitter and the client-side React hook.
// ============================================================================

// ── Event Names ─────────────────────────────────────────────────────────────

export type WSEventName =
  | "session.status_changed"
  | "agent.started"
  | "agent.completed"
  | "test.progress"
  | "test.failed"
  | "healing.started"
  | "healing.completed"
  | "courier.pr_created"
  | "courier.issue_created"
  | "pipeline.started"
  | "pipeline.completed";

// ── Event Payloads ──────────────────────────────────────────────────────────

export interface SessionStatusEvent {
  session_id: string;
  status: string;
  timestamp: string;
}

export interface AgentEvent {
  session_id: string;
  agent_name: string;
  status: "started" | "completed" | "failed";
  message?: string;
  timestamp: string;
}

export interface TestProgressEvent {
  session_id: string;
  step_index: number;
  step_name: string;
  status: "running" | "passed" | "failed";
  total_steps: number;
  error?: string;
  timestamp: string;
}

export interface CourierEvent {
  session_id: string;
  type: "pr" | "issue";
  url?: string;
  number?: number;
  includes_fix?: boolean;
  timestamp: string;
}

export interface PipelineEvent {
  session_id: string;
  status: "started" | "completed" | "failed";
  results_summary?: {
    total: number;
    passed: number;
    failed: number;
    duration_ms: number;
  };
  pr?: { url?: string; number?: number };
  timestamp: string;
}

// ── Union type ──────────────────────────────────────────────────────────────

export type WSEventPayload =
  | SessionStatusEvent
  | AgentEvent
  | TestProgressEvent
  | CourierEvent
  | PipelineEvent;
