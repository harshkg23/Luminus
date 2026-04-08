// ============================================================================
// TollGate — Playwright MCP Integration Types
// ============================================================================

// ── Test Plan Input (from Architect agent / manual trigger) ──────────────────

export interface TestPlanInput {
  /** Markdown-formatted test plan */
  test_plan: string;
  /** URL of the application to test */
  target_url: string;
  /** Unique session identifier for tracking */
  session_id: string;
}

// ── Individual Test Step (parsed from markdown) ──────────────────────────────

export interface TestStep {
  /** Step number (1-indexed) */
  index: number;
  /** Human-readable description of the step */
  description: string;
  /** The MCP action type to perform */
  action: MCPAction;
  /** Target element (accessibility label or role) */
  target?: string;
  /** Value to type or assert */
  value?: string;
}

export type MCPAction =
  | "navigate"
  | "click"
  | "type"
  | "snapshot"
  | "assert"
  | "wait"
  | "select"
  | "hover";

// ── Test Result (per-step outcome) ──────────────────────────────────────────

export interface TestResult {
  /** Name/description of the test step */
  name: string;
  /** Execution status */
  status: "passed" | "failed" | "skipped";
  /** Duration in milliseconds */
  duration_ms: number;
  /** Error message if failed */
  error?: string;
  /** Accessibility snapshot at time of failure */
  accessibility_snapshot?: string;
}

// ── Test Run Output (aggregated results) ────────────────────────────────────

export interface TestRunOutput {
  /** Session identifier */
  session_id: string;
  /** All individual test results */
  results: TestResult[];
  /** Total number of tests */
  total: number;
  /** Number of passed tests */
  passed: number;
  /** Number of failed tests */
  failed: number;
  /** Total duration in milliseconds */
  duration_ms: number;
}

// ── Agent Status ────────────────────────────────────────────────────────────

export type AgentState = "idle" | "running" | "error" | "starting";

export interface AgentStatus {
  /** Current agent state */
  state: AgentState;
  /** Human-readable status message */
  message: string;
  /** Timestamp of last state change */
  last_updated: string;
  /** Current task being executed (if running) */
  current_task?: string;
}

// ── Test Session ────────────────────────────────────────────────────────────

export type SessionStatus = "pending" | "running" | "completed" | "failed";

export interface TestSession {
  /** Unique session ID */
  id: string;
  /** Current session status */
  status: SessionStatus;
  /** Input that triggered this session */
  input: TestPlanInput;
  /** Results (populated after completion) */
  output?: TestRunOutput;
  /** ISO timestamp when session was created */
  created_at: string;
  /** ISO timestamp when session completed */
  completed_at?: string;
  /** Error message if session failed */
  error?: string;
}

// ── MCP Protocol Types ──────────────────────────────────────────────────────

export interface MCPToolCall {
  /** JSON-RPC method */
  method: string;
  /** Tool parameters */
  params: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

export interface MCPToolResponse {
  /** Whether the tool call succeeded */
  success: boolean;
  /** Result content from the tool */
  content?: Array<{
    type: string;
    text?: string;
  }>;
  /** Error message if failed */
  error?: string;
}

// ── MCP Server Config ───────────────────────────────────────────────────────

export interface MCPServerConfig {
  /** Run browser in headless mode */
  headless: boolean;
  /** Browser to use */
  browserName: "chromium" | "firefox" | "webkit";
  /** Viewport width */
  viewportWidth: number;
  /** Viewport height */
  viewportHeight: number;
}

export const DEFAULT_MCP_CONFIG: MCPServerConfig = {
  headless: true,
  browserName: "chromium",
  viewportWidth: 1280,
  viewportHeight: 720,
};
