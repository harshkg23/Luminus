"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  LayoutDashboard,
  GitBranch,
  Bot,
  FlaskConical,
  TerminalSquare,
  FileSearch,
  GitPullRequest,
  Settings2,
  Play,
  RefreshCcw,
  Shield,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  LogOut,
  Activity,
  Zap,
  Eye,
  Wrench,
  Send,
  Brain,
  ChevronRight,
  ArrowRight,
  AlertTriangle,
  CheckCheck,
  Cpu,
  Database,
  GitCommit,
  Slack,
  Github,
  ExternalLink,
  TrendingUp,
  BarChart3,
  Menu,
  X,
  Plug,
  FileText,
  CreditCard,
  Rocket,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSessionWebSocket } from "@/hooks/use-websocket";

/** Luminus (control plane). PRs + pipeline target repo is `TARGET_PRODUCT_REPO`. */
const CONTROL_PLANE_REPO = "harshkg23/Luminus";

// ─── Types ────────────────────────────────────────────────────────────────────

type AgentStatus = "idle" | "running" | "success" | "error";
type Tab =
  | "overview"
  | "pipeline"
  | "agents"
  | "tests"
  | "terminal"
  | "rca"
  | "prs";

interface RagInsight {
  agent: string;
  message: string;
  timestamp: string;
}
type PipelineStage =
  | "idle"
  | "architect"
  | "scripter"
  | "watchdog"
  | "healer"
  | "courier_pr"
  | "courier_issue"
  | "complete";

interface TerminalLine {
  text: string;
  type: "info" | "success" | "error" | "warn" | "agent" | "system" | "rag";
  ts: string;
}

interface TestResult {
  id: number;
  name: string;
  flow: string;
  status: "passed" | "failed" | "running" | "pending";
  duration: string;
  error?: string;
}

interface OpenPullRequest {
  number: number;
  title: string;
  state: string;
  url: string;
  author: string;
  headRef: string;
  baseRef: string;
  createdAt?: string;
  updatedAt?: string;
}

const mapEventAgentToFlowAgent = (agentName?: string): keyof Record<string, AgentStatus> | null => {
  if (!agentName) return null;
  const normalized = agentName.toLowerCase();
  if (normalized === "playwright") return "scripter";
  if (normalized === "test-writer") return "courier";
  if (["architect", "scripter", "watchdog", "healer", "courier"].includes(normalized)) {
    return normalized as keyof Record<string, AgentStatus>;
  }
  return null;
};

const buildAgentTasks = (statuses: Record<string, AgentStatus>): Record<string, string> => ({
  architect:
    statuses.architect === "running"
      ? "Reading repository via GitHub MCP..."
      : statuses.architect === "success"
      ? "Repository analysis completed"
      : "Awaiting trigger…",
  scripter:
    statuses.scripter === "running"
      ? "Generating and executing tests..."
      : statuses.scripter === "success"
      ? "Test execution finished"
      : "Awaiting test plan…",
  watchdog:
    statuses.watchdog === "running"
      ? "Analyzing failed test telemetry..."
      : statuses.watchdog === "success"
      ? "Anomalies analyzed"
      : "Monitoring metrics…",
  healer:
    statuses.healer === "running"
      ? "Preparing remediation context..."
      : statuses.healer === "success"
      ? "RCA prepared"
      : "On standby…",
  courier:
    statuses.courier === "running"
      ? "Dispatching GitHub/Slack notifications..."
      : statuses.courier === "success"
      ? "Notifications completed"
      : "Ready to notify…",
});

const derivePipelineStage = (
  statuses: Record<string, AgentStatus>,
  sessionStatus?: string,
  courierType?: "pr" | "issue",
): PipelineStage => {
  if (statuses.architect === "running") return "architect";
  if (statuses.scripter === "running") return "scripter";
  if (statuses.watchdog === "running") return "watchdog";
  if (statuses.healer === "running") return "healer";

  if (statuses.courier === "running" || statuses.courier === "success") {
    if (courierType === "issue") return "courier_issue";
    if (courierType === "pr") return "courier_pr";
    if (statuses.watchdog === "idle" && statuses.healer === "idle") return "complete";
    return "courier_pr";
  }

  if (sessionStatus === "completed") return "complete";
  if (sessionStatus === "failed") return courierType === "issue" ? "courier_issue" : "courier_pr";

  if (statuses.healer === "success") return "healer";
  if (statuses.watchdog === "success") return "watchdog";
  if (statuses.scripter === "success") return "scripter";
  if (statuses.architect === "success") return "architect";
  return "idle";
};

// ─── Agent Configs ────────────────────────────────────────────────────────────

const AGENTS = [
  {
    id: "architect",
    name: "THE ARCHITECT",
    role: "Planner",
    icon: <Brain className="w-5 h-5" />,
    color: "#A855F7",
    ring: "ring-purple-500/40",
    border: "border-purple-500/30",
    bg: "bg-purple-500/10",
    text: "text-purple-400",
    description:
      "Reads repo via GitHub MCP, generates a comprehensive test plan using Claude 3.5",
    capabilities: [
      "GitHub MCP integration",
      "LangGraph orchestration",
      "Test plan generation",
      "Code analysis",
    ],
  },
  {
    id: "scripter",
    name: "THE SCRIPTER",
    role: "Playwright MCP",
    icon: <Zap className="w-5 h-5" />,
    color: "#22D3EE",
    ring: "ring-cyan-500/40",
    border: "border-cyan-500/30",
    bg: "bg-cyan-500/10",
    text: "text-cyan-400",
    description:
      "Converts test plan → Playwright TypeScript tests, executes in headless Chromium",
    capabilities: [
      "Playwright MCP execution",
      "Headless browser testing",
      "DOM accessibility snapshots",
      "Test streaming",
    ],
  },
  {
    id: "healer",
    name: "THE HEALER",
    role: "Debugger",
    icon: <Wrench className="w-5 h-5" />,
    color: "#10B981",
    ring: "ring-emerald-500/40",
    border: "border-emerald-500/30",
    bg: "bg-emerald-500/10",
    text: "text-emerald-400",
    description:
      "Performs Root Cause Analysis via vector DB search, generates targeted code fixes",
    capabilities: [
      "RCA via Claude 3.5",
      "Vector DB semantic search",
      "Code patch generation",
      "Confidence scoring",
    ],
  },
  {
    id: "courier",
    name: "THE COURIER",
    role: "Notifications",
    icon: <Send className="w-5 h-5" />,
    color: "#3B82F6",
    ring: "ring-blue-500/40",
    border: "border-blue-500/30",
    bg: "bg-blue-500/10",
    text: "text-blue-400",
    description:
      "Creates GitHub PRs or Issues, posts Slack notifications with full RCA context",
    capabilities: [
      "GitHub PR creation",
      "GitHub Issue filing",
      "Slack API integration",
      "Team notifications",
    ],
  },
];

// ─── Pipeline Terminal Scripts ─────────────────────────────────────────────────

const now = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
};

const STAGE_SCRIPTS: Record<string, TerminalLine[]> = {
  architect: [
    { text: "TollGate v1.0.0 — pipeline triggered", type: "system", ts: "" },
    {
      text: "Code push detected: branch feat/checkout-v2 → main",
      type: "info",
      ts: "",
    },
    {
      text: "[ARCHITECT] Connecting to GitHub MCP server...",
      type: "agent",
      ts: "",
    },
    {
      text: "[ARCHITECT] Authenticated — reading repo: tollgate/frontend",
      type: "agent",
      ts: "",
    },
    {
      text: "[ARCHITECT] Analyzing 847 files across 12 modules...",
      type: "agent",
      ts: "",
    },
    {
      text: "[ARCHITECT] Identified 6 critical user flows to test",
      type: "agent",
      ts: "",
    },
    {
      text: "[ARCHITECT] Generating test plan via Claude 3.5 Sonnet...",
      type: "agent",
      ts: "",
    },
    {
      text: "[ARCHITECT] ✓ Test plan ready — 14 scenarios across 6 flows",
      type: "success",
      ts: "",
    },
  ],
  scripter: [
    {
      text: "[SCRIPTER] Received test plan from ARCHITECT",
      type: "agent",
      ts: "",
    },
    {
      text: "[SCRIPTER] Converting plan → Playwright TypeScript tests...",
      type: "agent",
      ts: "",
    },
    {
      text: "[SCRIPTER] Launching headless Chromium via Playwright MCP",
      type: "agent",
      ts: "",
    },
    { text: "[SCRIPTER] ── Flow: Login (3 tests) ──", type: "info", ts: "" },
    {
      text: "  ✓ test('renders login form correctly') — 0.3s",
      type: "success",
      ts: "",
    },
    {
      text: "  ✓ test('accepts valid credentials') — 1.2s",
      type: "success",
      ts: "",
    },
    {
      text: "  ✓ test('redirects to dashboard after login') — 0.8s",
      type: "success",
      ts: "",
    },
    {
      text: "[SCRIPTER] ── Flow: Navigation (2 tests) ──",
      type: "info",
      ts: "",
    },
    {
      text: "  ✓ test('sidebar renders all nav items') — 0.4s",
      type: "success",
      ts: "",
    },
    {
      text: "  ✓ test('routes update on nav click') — 0.6s",
      type: "success",
      ts: "",
    },
    { text: "[SCRIPTER] ── Flow: Checkout (2 tests) ──", type: "info", ts: "" },
    { text: "  ✓ test('adds item to cart') — 0.9s", type: "success", ts: "" },
    {
      text: "  ✗ test('completes checkout flow') — 3.1s  FAILED",
      type: "error",
      ts: "",
    },
    {
      text: '  Error: Locator(".checkout-btn") — expected: 1, received: 0',
      type: "error",
      ts: "",
    },
    {
      text: "  Screenshot saved → /tmp/failure-checkout-1742.png",
      type: "warn",
      ts: "",
    },
    {
      text: "[SCRIPTER] 13/14 passed — 1 failure detected",
      type: "warn",
      ts: "",
    },
  ],
  watchdog: [
    { text: "[WATCHDOG] Test failure alert received", type: "agent", ts: "" },
    {
      text: "[WATCHDOG] Querying Prometheus: http://prometheus:9090",
      type: "agent",
      ts: "",
    },
    {
      text: "[WATCHDOG] CPU: 23%  Memory: 64%  Disk I/O: 12MB/s",
      type: "info",
      ts: "",
    },
    {
      text: "[WATCHDOG] Error rate (5m): 0.04%  Latency p99: 142ms",
      type: "info",
      ts: "",
    },
    {
      text: "[WATCHDOG] Checking Datadog logs for DOM mutations...",
      type: "agent",
      ts: "",
    },
    {
      text: "[WATCHDOG] Found: DOM mutation logged at 10:38:42 UTC",
      type: "warn",
      ts: "",
    },
    {
      text: "[WATCHDOG] Log: button[class] changed — .checkout-btn → .checkout-button",
      type: "warn",
      ts: "",
    },
    {
      text: "[WATCHDOG] Anomaly report compiled — forwarding to HEALER",
      type: "agent",
      ts: "",
    },
  ],
  healer: [
    {
      text: "[HEALER] RCA initiated — received anomaly report",
      type: "agent",
      ts: "",
    },
    {
      text: "[HEALER] Querying Chroma vector DB for similar failures...",
      type: "agent",
      ts: "",
    },
    {
      text: "[HEALER] Found 3 historical matches (cosine similarity > 0.92)",
      type: "info",
      ts: "",
    },
    {
      text: "[HEALER] Analyzing DOM accessibility snapshot from failure...",
      type: "agent",
      ts: "",
    },
    {
      text: "[HEALER] Root cause identified: CSS selector regression",
      type: "success",
      ts: "",
    },
    {
      text: "[HEALER] Class renamed in commit a3f9c2b — not reflected in tests",
      type: "info",
      ts: "",
    },
    {
      text: "[HEALER] Generating code fix via Claude 3.5...",
      type: "agent",
      ts: "",
    },
    {
      text: "[HEALER] Fix: Replace .checkout-btn → [data-testid='checkout-button']",
      type: "success",
      ts: "",
    },
    {
      text: "[HEALER] Confidence score: 94% ✓ (threshold: 80%)",
      type: "success",
      ts: "",
    },
    {
      text: "[HEALER] Code patch validated — forwarding to COURIER",
      type: "agent",
      ts: "",
    },
  ],
  courier_pr: [
    {
      text: "[COURIER] Confidence >80% — creating GitHub Pull Request",
      type: "agent",
      ts: "",
    },
    {
      text: "[COURIER] Authenticating with GitHub API...",
      type: "agent",
      ts: "",
    },
    {
      text: "[COURIER] PR #47 created: 'fix: update checkout selector for test stability'",
      type: "success",
      ts: "",
    },
    {
      text: "[COURIER] PR URL: github.com/tollgate/frontend/pull/47",
      type: "info",
      ts: "",
    },
    {
      text: "[COURIER] Posting to Slack: #dev-alerts...",
      type: "agent",
      ts: "",
    },
    {
      text: "[COURIER] ✅ Slack notification sent to team",
      type: "success",
      ts: "",
    },
    {
      text: "Pipeline complete — 13/14 passed | 1 auto-remediated | MTTR: 28s",
      type: "system",
      ts: "",
    },
  ],
};

// ─── Mock Test Results ────────────────────────────────────────────────────────

const INITIAL_TESTS: TestResult[] = [
  {
    id: 1,
    name: "renders login form correctly",
    flow: "Login",
    status: "pending",
    duration: "—",
  },
  {
    id: 2,
    name: "accepts valid credentials",
    flow: "Login",
    status: "pending",
    duration: "—",
  },
  {
    id: 3,
    name: "redirects to dashboard after login",
    flow: "Login",
    status: "pending",
    duration: "—",
  },
  {
    id: 4,
    name: "sidebar renders all nav items",
    flow: "Navigation",
    status: "pending",
    duration: "—",
  },
  {
    id: 5,
    name: "routes update on nav click",
    flow: "Navigation",
    status: "pending",
    duration: "—",
  },
  {
    id: 6,
    name: "adds item to cart",
    flow: "Checkout",
    status: "pending",
    duration: "—",
  },
  {
    id: 7,
    name: "completes checkout flow",
    flow: "Checkout",
    status: "pending",
    duration: "—",
    error: 'Locator(".checkout-btn") not found',
  },
  {
    id: 8,
    name: "search returns relevant results",
    flow: "Search",
    status: "pending",
    duration: "—",
  },
  {
    id: 9,
    name: "filter updates product list",
    flow: "Search",
    status: "pending",
    duration: "—",
  },
  {
    id: 10,
    name: "profile page loads user data",
    flow: "Profile",
    status: "pending",
    duration: "—",
  },
  {
    id: 11,
    name: "edit profile updates DB",
    flow: "Profile",
    status: "pending",
    duration: "—",
  },
  {
    id: 12,
    name: "notifications appear on trigger",
    flow: "Notifications",
    status: "pending",
    duration: "—",
  },
  {
    id: 13,
    name: "mark notification as read",
    flow: "Notifications",
    status: "pending",
    duration: "—",
  },
  {
    id: 14,
    name: "logout clears session correctly",
    flow: "Auth",
    status: "pending",
    duration: "—",
  },
];

const DURATIONS = [
  "0.3s",
  "0.8s",
  "1.2s",
  "0.4s",
  "0.6s",
  "0.9s",
  "3.1s",
  "0.7s",
  "1.1s",
  "0.5s",
  "1.4s",
  "0.6s",
  "0.8s",
  "0.3s",
];

// ─── Sidebar ──────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  {
    id: "overview",
    label: "Overview",
    icon: <LayoutDashboard className="w-4 h-4" />,
  },
  {
    id: "pipeline",
    label: "Pipeline",
    icon: <GitBranch className="w-4 h-4" />,
  },
  { id: "agents", label: "Agents", icon: <Bot className="w-4 h-4" /> },
  {
    id: "tests",
    label: "Test Results",
    icon: <FlaskConical className="w-4 h-4" />,
  },
  {
    id: "terminal",
    label: "Live Terminal",
    icon: <TerminalSquare className="w-4 h-4" />,
  },
  {
    id: "prs",
    label: "PR Tracker",
    icon: <GitPullRequest className="w-4 h-4" />,
  },
] as const;

function Sidebar({
  activeTab,
  setTab,
  session,
  sidebarOpen,
  setSidebarOpen,
}: {
  activeTab: Tab;
  setTab: (t: Tab) => void;
  session: ReturnType<typeof useSession>["data"];
  sidebarOpen: boolean;
  setSidebarOpen: (v: boolean) => void;
}) {
  const user = session?.user as
    | { name?: string; email?: string; image?: string }
    | undefined;

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`
          fixed top-0 left-0 h-screen w-64 z-40 flex flex-col
          glass-strong border-r border-border/50
          transition-transform duration-300
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        `}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-5 h-16 border-b border-border/40 shrink-0">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-7 h-7 rounded-md bg-primary/20 border border-primary/40 flex items-center justify-center text-[10px] font-bold text-primary">
              LQ
            </div>
            <span className="text-base font-bold tracking-tight">
              Luminus<span className="text-primary"> · TollGate</span>
            </span>
          </Link>
          <button
            className="md:hidden text-muted-foreground"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Live indicator */}
        <div className="mx-4 mt-4 mb-2 flex items-center gap-2 glass rounded-lg px-3 py-2 neon-border">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-secondary opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-secondary" />
          </span>
          <span className="text-xs text-secondary font-medium">
            Agents Offline · 5/5
          </span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 px-3 pt-2 pb-1">
            Monitor
          </p>
          {NAV_ITEMS.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setTab(item.id as Tab);
                  setSidebarOpen(false);
                }}
                className={`
                  w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
                  transition-all duration-150 group text-left
                  ${
                    active
                      ? "bg-primary/15 text-primary border border-primary/25"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                  }
                `}
              >
                <span
                  className={
                    active
                      ? "text-primary"
                      : "text-muted-foreground group-hover:text-foreground transition-colors"
                  }
                >
                  {item.icon}
                </span>
                {item.label}
                {active && (
                  <ChevronRight className="w-3 h-3 ml-auto text-primary/60" />
                )}
              </button>
            );
          })}

          <div className="pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 px-3 pb-1">
              System
            </p>
            <Link
              href="/deployment"
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-orange-400 hover:bg-orange-500/10 transition-all"
            >
              <Rocket className="w-4 h-4" />
              Canary Deploy
            </Link>
            <Link
              href="/mcp-test"
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-cyan-400 hover:bg-cyan-500/10 transition-all"
            >
              <Plug className="w-4 h-4" />
              MCP Health Check
            </Link>
            <Link
              href="/notion-test"
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-purple-400 hover:bg-purple-500/10 transition-all"
            >
              <FileText className="w-4 h-4" />
              Notion Test
            </Link>
            <Link
              href="/pricing"
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10 transition-all"
            >
              <CreditCard className="w-4 h-4" />
              Pricing
            </Link>

          </div>
        </nav>

        {/* User profile */}
        <div className="border-t border-border/40 p-3 shrink-0">
          {session ? (
            <div className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-muted/30 transition-colors group">
              {user?.image ? (
                <img
                  src={user.image}
                  referrerPolicy="no-referrer"
                  alt="avatar"
                  className="w-8 h-8 rounded-full object-cover ring-2 ring-primary/30 shrink-0"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                  {user?.name?.[0]?.toUpperCase() ?? "?"}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">
                  {user?.name ?? "User"}
                </p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {user?.email}
                </p>
              </div>
              <button
                onClick={() => signOut({ callbackUrl: "/" })}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                title="Sign out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <Link
              href="/auth"
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              <Shield className="w-4 h-4" />
              Sign in
            </Link>
          )}
        </div>
      </aside>
    </>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  icon,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="glass rounded-xl border border-border/50 p-4 hover:border-border transition-colors">
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </p>
        <span style={{ color }} className="opacity-80">
          {icon}
        </span>
      </div>
      <p className="text-2xl font-black text-foreground mb-1">{value}</p>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

// ─── Agent Status Badge ───────────────────────────────────────────────────────

function StatusBadge({ status }: { status: AgentStatus }) {
  const map = {
    idle: {
      label: "Idle",
      cls: "text-muted-foreground bg-muted/40 border-border/40",
    },
    running: {
      label: "Running",
      cls: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30 animate-pulse",
    },
    success: {
      label: "Done",
      cls: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
    },
    error: {
      label: "Failed",
      cls: "text-red-400 bg-red-500/10 border-red-500/30",
    },
  };
  const { label, cls } = map[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cls}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          status === "running"
            ? "bg-cyan-400 animate-ping"
            : status === "success"
              ? "bg-emerald-400"
              : status === "error"
                ? "bg-red-400"
                : "bg-muted-foreground"
        }`}
      />
      {label}
    </span>
  );
}

// ─── Agent Card (mini) ────────────────────────────────────────────────────────

function AgentMiniCard({
  agent,
  status,
  task,
}: {
  agent: (typeof AGENTS)[0];
  status: AgentStatus;
  task: string;
}) {
  return (
    <motion.div
      animate={
        status === "running"
          ? {
              boxShadow: [
                `0 0 0px ${agent.color}00`,
                `0 0 20px ${agent.color}30`,
                `0 0 0px ${agent.color}00`,
              ],
            }
          : {}
      }
      transition={{ duration: 2, repeat: Infinity }}
      className={`glass rounded-xl p-4 border ${status === "running" ? agent.border : "border-border/40"} transition-all`}
    >
      <div className="flex items-start justify-between mb-3">
        <div
          className={`w-9 h-9 rounded-xl ${agent.bg} border ${agent.border} flex items-center justify-center ${agent.text}`}
        >
          {agent.icon}
        </div>
        <StatusBadge status={status} />
      </div>
      <p className={`text-xs font-bold tracking-wide ${agent.text} mb-0.5`}>
        {agent.name}
      </p>
      <p className="text-[10px] text-muted-foreground mb-2">
        {agent.role}
      </p>
      <p className="text-xs text-foreground/70 leading-relaxed line-clamp-2">
        {task || "Waiting for instructions…"}
      </p>
    </motion.div>
  );
}

// ─── RAG Insight Banner ───────────────────────────────────────────────────────

function RagInsightBanner({ insights }: { insights: RagInsight[] }) {
  if (insights.length === 0) return null;

  return (
    <div className="space-y-2">
      {insights.map((insight, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: i * 0.1 }}
          className="rounded-xl border border-violet-500/40 bg-violet-500/10 px-4 py-3 flex items-start gap-3"
        >
          <div className="w-8 h-8 rounded-lg bg-violet-500/20 border border-violet-500/40 flex items-center justify-center shrink-0 mt-0.5">
            <Database className="w-4 h-4 text-violet-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30">
                RAG INSIGHT
              </span>
              <span className="text-[10px] text-violet-400/70 font-medium">
                {insight.agent}
              </span>
              <span className="text-[10px] text-muted-foreground/50 ml-auto">
                {insight.timestamp}
              </span>
            </div>
            <p className="text-xs text-violet-200/90 leading-relaxed">
              {insight.message}
            </p>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// ─── Pipeline Flow Visualization ──────────────────────────────────────────────

function PipelineFlowViz({
  stage,
  agentStatuses,
  terminalLines,
}: {
  stage: PipelineStage;
  agentStatuses: Record<string, AgentStatus>;
  terminalLines: TerminalLine[];
}) {

  const AgentNode = ({ id, label, role }: { id: string; label: string; role: string }) => {
    const agent = AGENTS.find((a) => a.id === id);
    const s = agentStatuses[id] ?? "idle";
    const agentBg = agent?.bg ?? "bg-muted/20";
    const agentBorder = agent?.border ?? "border-border/40";
    const agentText = agent?.text ?? "text-muted-foreground";
    const agentColor = agent?.color;
    let cls = `${agentBg} border ${agentBorder} ${agentText}`;
    if (s === "running") cls = `${agentBg} border-2 ${agentBorder} ${agentText}`;
    if (s === "success") cls = "bg-emerald-500/10 border-2 border-emerald-500/50 text-emerald-400";
    if (s === "error")   cls = "bg-red-500/10 border-2 border-red-500/50 text-red-400";
    return (
      <motion.div
        animate={s === "running" ? { scale: [1, 1.03, 1] } : {}}
        transition={{ duration: 1.5, repeat: Infinity }}
        style={s === "running" ? { boxShadow: `0 0 18px ${agentColor}40` } : {}}
        className={`relative rounded-2xl p-4 text-center w-full max-w-[180px] transition-all ${cls}`}
      >
        <div className={`w-10 h-10 rounded-xl mx-auto mb-2 flex items-center justify-center ${agentBg} border ${agentBorder}`}>
          <span className="scale-110">{agent?.icon}</span>
        </div>
        <p className="text-xs font-bold tracking-wider uppercase">{label}</p>
        <p className="text-[10px] opacity-50 mt-0.5 leading-tight">{role}</p>
        <div className="mt-2 flex justify-center">
          <StatusBadge status={s} />
        </div>
        {s === "running" && (
          <div className="absolute -inset-px rounded-2xl border-2 animate-pulse pointer-events-none"
            style={{ borderColor: `${agentColor}60` }} />
        )}
      </motion.div>
    );
  };

  const VConn = ({
    label,
    active = false,
    tone = "primary",
  }: {
    label?: string;
    active?: boolean;
    tone?: "primary" | "success" | "danger";
  }) => (
    <div className="flex flex-col items-center">
      <div className={`w-px h-5 bg-gradient-to-b ${
        active
          ? tone === "success"
            ? "from-emerald-400/30 to-emerald-400/90"
            : tone === "danger"
            ? "from-red-400/30 to-red-400/90"
            : "from-cyan-400/30 to-cyan-400/90"
          : "from-border/30 to-border/60"
      }`} />
      {label && (
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full my-0.5 border ${
          active
            ? label === "YES"
              ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
              : "text-red-400 bg-red-500/10 border-red-500/30"
            : "text-muted-foreground/70 bg-muted/20 border-border/40"
        }`}>{label}</span>
      )}
      <div className="flex flex-col items-center">
        <div className={`w-px h-4 ${
          active
            ? tone === "success"
              ? "bg-emerald-400/90"
              : tone === "danger"
              ? "bg-red-400/90"
              : "bg-cyan-400/90"
            : "bg-border/60"
        }`} />
        <svg width="10" height="6" viewBox="0 0 10 6" className="block shrink-0">
          <polygon
            points="5,6 0,0 10,0"
            fill={
              active
                ? tone === "success"
                  ? "rgb(52 211 153 / 0.9)"
                  : tone === "danger"
                  ? "rgb(248 113 113 / 0.9)"
                  : "rgb(34 211 238 / 0.9)"
                : "rgb(148 163 184 / 0.6)"
            }
          />
        </svg>
      </div>
    </div>
  );

  const Diamond = ({ label, active = false }: { label: string; active?: boolean }) => (
    <div className="relative flex items-center justify-center my-2" style={{ width: 120, height: 64 }}>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className={`w-[80px] h-[80px] rotate-45 rounded-xl border-2 transition-all ${
          active
            ? "border-primary/80 bg-primary/20 shadow-[0_0_20px_rgba(99,102,241,0.4)]"
            : "border-primary/25 bg-primary/5"
        }`} />
      </div>
      <p className={`relative z-10 text-[11px] font-bold text-center leading-snug px-3 whitespace-pre-line ${
        active ? "text-primary" : "text-primary/60"
      }`}>{label}</p>
    </div>
  );

  const TriggerNode = () => (
    <div className={`rounded-2xl p-4 text-center border transition-all ${
      stage !== "idle"
        ? "border-primary/60 bg-primary/10 text-primary shadow-[0_0_20px_rgba(99,102,241,0.25)]"
        : "border-border/40 bg-muted/20 text-muted-foreground"
    }`}>
      <GitCommit className="w-7 h-7 mx-auto mb-2" />
      <p className="text-xs font-bold uppercase tracking-wider">Code Push</p>
      <p className="text-[10px] opacity-50 mt-0.5">Trigger</p>
    </div>
  );


  /* Courier outcome node */
  const OutcomeNode = ({
    icon, label, sublabel, active, activeClass,
  }: {
    icon: React.ReactNode;
    label: string;
    sublabel: string;
    active: boolean;
    activeClass: string;
  }) => (
    <div className={`rounded-2xl p-3 text-center border w-full max-w-[160px] transition-all ${
      active ? activeClass : "border-border/40 bg-muted/20 text-muted-foreground"
    }`}>
      <div className="w-8 h-8 mx-auto mb-1.5 flex items-center justify-center">{icon}</div>
      <p className="text-xs font-bold uppercase tracking-wide">{label}</p>
      <p className="text-[10px] opacity-60 mt-0.5 leading-tight">{sublabel}</p>
    </div>
  );

  /* Log colors */
  const logColor: Record<string, string> = {
    system:  "text-primary font-semibold",
    info:    "text-foreground/70",
    success: "text-emerald-400",
    error:   "text-red-400",
    warn:    "text-amber-400",
    agent:   "text-cyan-400",
    rag:     "text-violet-400 font-semibold",
  };

  const playwrightPassed = terminalLines.filter(
    (l) => l.text.includes("✓") && (l.text.includes("test(") || l.text.includes("SCRIPTER"))
  ).length;

  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [terminalLines]);

  const stageRank: Record<PipelineStage, number> = {
    idle: 0,
    architect: 1,
    scripter: 2,
    watchdog: 3,
    healer: 4,
    courier_pr: 5,
    courier_issue: 5,
    complete: 6,
  };
  const atLeast = (target: PipelineStage) => stageRank[stage] >= stageRank[target];

  const courierPrActive = stage === "courier_pr" || stage === "complete";
  const courierIssueActive = stage === "courier_issue";
  const courierSlackActive = stage === "complete";

  const triggerToArchitectActive = atLeast("architect");
  const architectToScripterActive = atLeast("scripter");
  const scripterToDecisionActive = atLeast("scripter");
  const failBranchActive = atLeast("healer") || courierIssueActive || courierPrActive;
  const healerToConfidenceActive = atLeast("healer");

  return (
    <div className="glass rounded-2xl neon-border overflow-hidden">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border/40 bg-card/30">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center">
            <Activity className="w-3.5 h-3.5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-bold text-foreground">Live Pipeline</p>
            <p className="text-[10px] text-muted-foreground">Multi-Agent Data Flow</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {stage !== "idle" && (
            <span className="relative flex items-center gap-1.5 text-xs font-medium text-secondary">
              <span className="w-2 h-2 rounded-full bg-secondary animate-ping absolute" />
              <span className="w-2 h-2 rounded-full bg-secondary relative" />
              <span className="ml-1">Live</span>
            </span>
          )}
          <span className={`text-xs px-3 py-1 rounded-full border font-semibold tracking-wide ${
            stage === "idle"
              ? "text-muted-foreground border-border/50 bg-muted/20"
              : stage === "complete"
              ? "text-emerald-400 border-emerald-500/40 bg-emerald-500/10"
              : "text-cyan-400 border-cyan-500/40 bg-cyan-500/10 animate-pulse"
          }`}>
            {stage === "idle" ? "Idle" : stage === "complete" ? "✓ Complete" : `▶ ${stage.toUpperCase()}`}
          </span>
        </div>
      </div>

      {/* ── Body: exactly 50/50 ── */}
      <div className="grid grid-cols-[1.1fr_0.9fr] divide-x divide-border/30 min-h-[560px]">

        {/* ══ LEFT: Flow Diagram ══ */}
        <div className="p-6 flex flex-col items-center overflow-y-auto gap-0 h-full">
          <TriggerNode />
          <VConn active={triggerToArchitectActive} />
          <AgentNode id="architect" label="Architect" role="Plans tests via GitHub MCP" />
          <VConn active={architectToScripterActive} />
          <AgentNode id="scripter" label="Scripter" role="Playwright MCP executor" />
          <VConn active={scripterToDecisionActive} />
          <Diamond label={"Tests\nPass?"} active={stage !== "idle"} />

          {/* YES / NO fork */}
          {/* YES / NO fork */}
          <div className="w-full flex justify-around items-start gap-4 mt-1">
            {/* ── YES PATH ── */}
            <div className="flex flex-col items-center">
              <VConn label="YES" active={courierSlackActive} tone="success" />
              <OutcomeNode
                icon={<Send className="w-5 h-5" />}
                label="Courier"
                sublabel="All Clear → Slack"
                active={courierSlackActive}
                activeClass="border-emerald-500/60 bg-emerald-500/10 text-emerald-400 shadow-[0_0_16px_rgba(16,185,129,0.25)]"
              />
            </div>

            {/* ── NO PATH ── */}
            <div className="flex flex-col items-center">
              <VConn label="NO" active={failBranchActive} tone="danger" />
              <AgentNode id="healer" label="Healer" role="RCA + code patch" />
              <VConn active={healerToConfidenceActive} tone="danger" />
              <Diamond label={"Confidence\n>80%?"} active={["healer","courier_pr","courier_issue","complete"].includes(stage)} />
              <div className="w-full flex justify-around gap-2 mt-1">
                <div className="flex flex-col items-center">
                  <VConn label="YES" active={courierPrActive} tone="success" />
                  <OutcomeNode
                    icon={<Github className="w-4 h-4" />}
                    label="Courier"
                    sublabel="GitHub PR"
                    active={courierPrActive}
                    activeClass="border-emerald-500/60 bg-emerald-500/10 text-emerald-400 shadow-[0_0_16px_rgba(16,185,129,0.25)]"
                  />
                </div>
                <div className="flex flex-col items-center">
                  <VConn label="NO" active={courierIssueActive} tone="danger" />
                  <OutcomeNode
                    icon={<AlertTriangle className="w-4 h-4" />}
                    label="Courier"
                    sublabel="GitHub Issue"
                    active={courierIssueActive}
                    activeClass="border-red-500/60 bg-red-500/10 text-red-400 shadow-[0_0_16px_rgba(239,68,68,0.25)]"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ══ RIGHT: Live Logs ══ */}
        <div className="flex flex-col h-full">
          {/* Toolbar */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border/40 bg-black/30 shrink-0">
            <div className="flex gap-1.5">
              <span className="w-3 h-3 rounded-full bg-red-500/70" />
              <span className="w-3 h-3 rounded-full bg-amber-500/70" />
              <span className="w-3 h-3 rounded-full bg-emerald-500/70" />
            </div>
            <span className="text-xs font-mono text-muted-foreground ml-1">execution-logs</span>
            <div className="ml-auto flex items-center gap-2">
              {playwrightPassed > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 font-mono">
                  playwright · {playwrightPassed} ✓
                </span>
              )}
              {stage !== "idle" && (
                <span className="flex items-center gap-1.5 text-[10px] text-secondary">
                  <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
                  streaming
                </span>
              )}
            </div>
          </div>

          {/* Log stream */}
          <div
            ref={logRef}
            className="flex-1 h-full overflow-y-auto p-3 font-mono text-[10px] leading-relaxed bg-black/40 space-y-0.5"
          >
            {terminalLines.length === 0 ? (
              <p className="text-muted-foreground/30 pt-4 text-center text-xs">Run pipeline to see live logs…</p>
            ) : (
              terminalLines.map((line, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: 6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2 }}
                  className={`flex gap-2 ${line.type === "rag" ? "bg-violet-500/10 rounded px-1.5 py-0.5 border-l-2 border-violet-500/50" : ""}`}
                >
                  <span className="text-muted-foreground/30 shrink-0 tabular-nums">{line.ts}</span>
                  <span className={logColor[line.type] ?? "text-foreground/60"}>{line.text}</span>
                </motion.div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Live Terminal ────────────────────────────────────────────────────────────

function LiveTerminalPanel({ lines }: { lines: TerminalLine[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  const colorMap: Record<string, string> = {
    system: "text-primary",
    info: "text-foreground/70",
    success: "text-emerald-400",
    error: "text-red-400",
    warn: "text-amber-400",
    agent: "text-cyan-400",
    rag: "text-violet-400 font-semibold",
  };

  return (
    <div className="glass rounded-xl neon-border overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/50 bg-card/20">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-destructive/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-accent/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-secondary/60" />
        </div>
        <span className="text-xs text-muted-foreground font-mono ml-2">
          tollgate — pipeline output
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
          <span className="text-[10px] text-secondary">Live</span>
        </div>
      </div>
      <div className="p-4 font-mono text-xs leading-relaxed bg-black/30 min-h-[320px] max-h-[400px] overflow-y-auto">
        {lines.length === 0 ? (
          <p className="text-muted-foreground/40">
            Waiting for pipeline trigger…
          </p>
        ) : (
          lines.map((line, i) => (
            <div key={i} className={`flex gap-3 mb-0.5 ${line.type === "rag" ? "bg-violet-500/10 rounded px-1.5 py-0.5 border-l-2 border-violet-500/50" : ""}`}>
              <span className="text-muted-foreground/40 shrink-0">
                {line.ts}
              </span>
              <span className={colorMap[line.type]}>{line.text}</span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

// ─── Activity Feed ────────────────────────────────────────────────────────────

const ACTIVITY = [
  {
    time: "Just now",
    icon: <Send className="w-3 h-3" />,
    color: "text-blue-400",
    text: "COURIER created PR #47 — checkout selector fix",
  },
  {
    time: "28s ago",
    icon: <Wrench className="w-3 h-3" />,
    color: "text-emerald-400",
    text: "HEALER identified root cause — confidence 94%",
  },
  {
    time: "52s ago",
    icon: <Eye className="w-3 h-3" />,
    color: "text-amber-400",
    text: "WATCHDOG detected DOM mutation in SRE logs",
  },
  {
    time: "1m ago",
    icon: <XCircle className="w-3 h-3" />,
    color: "text-red-400",
    text: "SCRIPTER: test 'completes checkout flow' FAILED",
  },
  {
    time: "2m ago",
    icon: <CheckCircle2 className="w-3 h-3" />,
    color: "text-emerald-400",
    text: "SCRIPTER: 13 tests passed across 5 flows",
  },
  {
    time: "3m ago",
    icon: <Brain className="w-3 h-3" />,
    color: "text-purple-400",
    text: "ARCHITECT generated test plan — 14 scenarios",
  },
  {
    time: "3m ago",
    icon: <GitCommit className="w-3 h-3" />,
    color: "text-primary",
    text: "Pipeline triggered — push to feat/checkout-v2",
  },
];

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({
  agentStatuses,
  agentTasks,
  stage,
  terminalLines,
  tests,
  ragInsights,
}: {
  agentStatuses: Record<string, AgentStatus>;
  agentTasks: Record<string, string>;
  stage: PipelineStage;
  terminalLines: TerminalLine[];
  tests: TestResult[];
  ragInsights: RagInsight[];
}) {
  const passed = tests.filter((t) => t.status === "passed").length;
  const failed = tests.filter((t) => t.status === "failed").length;
  const total = tests.length;
  const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;
  const activeAgents = Object.values(agentStatuses).filter(
    (s) => s === "running",
  ).length;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Tests"
          value={String(total)}
          sub={`${passed} passed · ${failed} failed`}
          icon={<FlaskConical className="w-4 h-4" />}
          color="#22D3EE"
        />
        <StatCard
          label="Pass Rate"
          value={`${passRate}%`}
          sub={stage === "idle" ? "Awaiting next run" : "Current run"}
          icon={<TrendingUp className="w-4 h-4" />}
          color="#10B981"
        />
        <StatCard
          label="Agents Online"
          value={`${5 - activeAgents > 0 ? 5 : activeAgents}/5`}
          sub="All agents healthy"
          icon={<Bot className="w-4 h-4" />}
          color="#A855F7"
        />
        <StatCard
          label="Last MTTR"
          value="28s"
          sub="Auto-remediated 1 failure"
          icon={<Zap className="w-4 h-4" />}
          color="#F59E0B"
        />
      </div>

      <RagInsightBanner insights={ragInsights} />

      {/* Agent grid */}
      <div>
        <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
          <Bot className="w-4 h-4 text-primary" /> Agent Status
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {AGENTS.map((agent) => (
            <AgentMiniCard
              key={agent.id}
              agent={agent}
              status={agentStatuses[agent.id] ?? "idle"}
              task={agentTasks[agent.id] ?? ""}
            />
          ))}
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Terminal preview */}
        <LiveTerminalPanel lines={terminalLines.slice(-12)} />

        {/* Activity feed */}
        <div className="glass rounded-xl border border-border/50 overflow-hidden">
          <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">
              Recent Activity
            </span>
          </div>
          <div className="divide-y divide-border/30">
            {ACTIVITY.map((item, i) => (
              <div
                key={i}
                className="flex items-start gap-3 px-4 py-3 hover:bg-muted/20 transition-colors"
              >
                <div className={`mt-0.5 ${item.color} shrink-0`}>
                  {item.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground/80 leading-relaxed">
                    {item.text}
                  </p>
                </div>
                <span className="text-[10px] text-muted-foreground/50 shrink-0 mt-0.5">
                  {item.time}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Agents Tab ───────────────────────────────────────────────────────────────

function AgentsTab({
  agentStatuses,
  agentTasks,
}: {
  agentStatuses: Record<string, AgentStatus>;
  agentTasks: Record<string, string>;
}) {
  return (
    <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
      {AGENTS.map((agent) => {
        const status = agentStatuses[agent.id] ?? "idle";
        const task = agentTasks[agent.id] ?? "Waiting for instructions…";
        return (
          <motion.div
            key={agent.id}
            animate={
              status === "running"
                ? {
                    boxShadow: [
                      `0 0 0px ${agent.color}00`,
                      `0 0 30px ${agent.color}25`,
                      `0 0 0px ${agent.color}00`,
                    ],
                  }
                : {}
            }
            transition={{ duration: 2, repeat: Infinity }}
            className={`glass rounded-2xl border p-5 transition-all ${status === "running" ? agent.border : "border-border/40"}`}
          >
            <div className="flex items-start justify-between mb-4">
              <div
                className={`w-12 h-12 rounded-xl ${agent.bg} border ${agent.border} flex items-center justify-center ${agent.text}`}
              >
                <span className="scale-125">{agent.icon}</span>
              </div>
              <StatusBadge status={status} />
            </div>

            <h3
              className={`text-sm font-black tracking-wide ${agent.text} mb-0.5`}
            >
              {agent.name}
            </h3>
            <p className="text-xs text-muted-foreground mb-1">{agent.role}</p>


            <p className="text-xs text-foreground/60 leading-relaxed mb-4">
              {agent.description}
            </p>

            {/* Current task */}
            <div
              className={`rounded-lg p-3 ${agent.bg} border ${agent.border} mb-3`}
            >
              <p
                className={`text-[10px] font-semibold uppercase tracking-widest ${agent.text} mb-1`}
              >
                Current Task
              </p>
              <p className="text-xs text-foreground/80">{task}</p>
            </div>

            {/* Capabilities */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 mb-2">
                Capabilities
              </p>
              <div className="flex flex-wrap gap-1.5">
                {agent.capabilities.map((cap) => (
                  <span
                    key={cap}
                    className={`text-[10px] px-2 py-0.5 rounded-md bg-muted/40 border border-border/40 text-muted-foreground`}
                  >
                    {cap}
                  </span>
                ))}
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

// ─── Tests Tab ────────────────────────────────────────────────────────────────

function TestsTab({ tests }: { tests: TestResult[] }) {
  const passed = tests.filter((t) => t.status === "passed").length;
  const failed = tests.filter((t) => t.status === "failed").length;
  const pending = tests.filter((t) => t.status === "pending").length;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Total", value: tests.length, color: "text-foreground" },
          { label: "Passed", value: passed, color: "text-emerald-400" },
          { label: "Failed", value: failed, color: "text-red-400" },
          { label: "Pending", value: pending, color: "text-muted-foreground" },
        ].map((item) => (
          <div
            key={item.label}
            className="glass rounded-xl p-4 border border-border/40 text-center"
          >
            <p className={`text-2xl font-black ${item.color}`}>{item.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{item.label}</p>
          </div>
        ))}
      </div>

      {/* Test table */}
      <div className="glass rounded-xl border border-border/40 overflow-hidden">
        <div className="px-4 py-3 border-b border-border/40 grid grid-cols-12 gap-4">
          <p className="col-span-5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
            Test Name
          </p>
          <p className="col-span-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
            Flow
          </p>
          <p className="col-span-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
            Status
          </p>
          <p className="col-span-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
            Time
          </p>
          <p className="col-span-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
            Error
          </p>
        </div>
        <div className="divide-y divide-border/20">
          {tests.map((test) => (
            <div
              key={test.id}
              className="px-4 py-3 grid grid-cols-12 gap-4 items-center hover:bg-muted/10 transition-colors"
            >
              <div className="col-span-5 flex items-center gap-2">
                {test.status === "passed" && (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                )}
                {test.status === "failed" && (
                  <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                )}
                {test.status === "running" && (
                  <Loader2 className="w-3.5 h-3.5 text-cyan-400 animate-spin shrink-0" />
                )}
                {test.status === "pending" && (
                  <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                )}
                <span className="text-xs text-foreground/80 font-mono truncate">
                  {test.name}
                </span>
              </div>
              <p className="col-span-2 text-xs text-muted-foreground">
                {test.flow}
              </p>
              <div className="col-span-2">
                <StatusBadge
                  status={
                    test.status === "pending"
                      ? "idle"
                      : test.status === "running"
                        ? "running"
                        : test.status === "passed"
                          ? "success"
                          : "error"
                  }
                />
              </div>
              <p className="col-span-1 text-xs font-mono text-muted-foreground">
                {test.duration}
              </p>
              <p className="col-span-2 text-[10px] font-mono text-red-400/70 truncate">
                {test.error ?? "—"}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── RCA Report Tab ───────────────────────────────────────────────────────────

function RcaTab({ stage }: { stage: PipelineStage }) {
  const hasReport = [
    "healer",
    "courier_pr",
    "courier_issue",
    "complete",
  ].includes(stage);

  if (!hasReport) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground/50">
        <FileSearch className="w-12 h-12 mb-3 opacity-30" />
        <p className="text-sm">No RCA reports yet</p>
        <p className="text-xs mt-1">
          Reports appear after a test failure is analyzed
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="glass rounded-2xl border border-emerald-500/20 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border/40 bg-emerald-500/5 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                RCA Report #001
              </span>
              <span className="text-[10px] text-muted-foreground">
                Generated by HEALER · Just now
              </span>
            </div>
            <h3 className="text-base font-bold text-foreground">
              CSS Selector Regression — Checkout Button
            </h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              test: &quot;completes checkout flow&quot; · Flow: Checkout
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-black text-emerald-400">94%</p>
            <p className="text-[10px] text-muted-foreground">Confidence</p>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 grid md:grid-cols-2 gap-6">
          {/* Root cause */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-3">
              Root Cause
            </p>
            <div className="space-y-2">
              {[
                {
                  icon: <GitCommit className="w-3.5 h-3.5" />,
                  label: "Commit",
                  value: "a3f9c2b — Renamed CSS class in checkout component",
                },
                {
                  icon: <AlertTriangle className="w-3.5 h-3.5" />,
                  label: "Change",
                  value: ".checkout-btn → .checkout-button (no test update)",
                },
                {
                  icon: <Database className="w-3.5 h-3.5" />,
                  label: "Evidence",
                  value: "DOM mutation logged at 10:38:42 UTC (Datadog)",
                },
                {
                  icon: <BarChart3 className="w-3.5 h-3.5" />,
                  label: "Similarity",
                  value: "3 historical matches found (score: 0.94)",
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex items-start gap-2.5 p-3 rounded-lg bg-muted/20 border border-border/30"
                >
                  <span className="text-muted-foreground mt-0.5 shrink-0">
                    {item.icon}
                  </span>
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground/70">
                      {item.label}
                    </p>
                    <p className="text-xs text-foreground/80">{item.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Code fix */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-3">
              Generated Fix
            </p>
            <div className="rounded-xl overflow-hidden border border-border/40 bg-black/40 font-mono text-xs">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-border/30 bg-muted/10">
                <div className="flex gap-1">
                  <div className="w-2 h-2 rounded-full bg-destructive/60" />
                  <div className="w-2 h-2 rounded-full bg-accent/60" />
                  <div className="w-2 h-2 rounded-full bg-secondary/60" />
                </div>
                <span className="text-[10px] text-muted-foreground">
                  checkout.spec.ts — patch
                </span>
              </div>
              <div className="p-4 space-y-1">
                <div className="text-muted-foreground/40">{"// Before"}</div>
                <div className="bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20">
                  <span className="text-red-400">
                    - await page.click(&apos;.checkout-btn&apos;);
                  </span>
                </div>
                <div className="text-muted-foreground/40 pt-1">
                  {"// After (HEALER fix)"}
                </div>
                <div className="bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  <span className="text-emerald-400">
                    + await
                    page.click(&apos;[data-testid=&quot;checkout-button&quot;]&apos;);
                  </span>
                </div>
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <Button
                size="sm"
                className="flex-1 glow-cyan bg-primary text-primary-foreground gap-2"
              >
                <CheckCheck className="w-3.5 h-3.5" /> Approve PR #47
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-destructive/40 text-destructive hover:bg-destructive/10"
              >
                <XCircle className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── PR Tracker Tab ───────────────────────────────────────────────────────────

function PrsTab({
  pullRequests,
  loading,
  error,
  selectedPrNumber,
  onSelect,
  onRefresh,
}: {
  pullRequests: OpenPullRequest[];
  loading: boolean;
  error: string;
  selectedPrNumber: number | null;
  onSelect: (prNumber: number) => void;
  onRefresh: () => void;
}) {
  const openCount = pullRequests.filter((pr) => pr.state === "open").length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          {
            label: "Loaded PRs",
            value: String(pullRequests.length),
            color: "text-foreground",
          },
          {
            label: "Selected",
            value: selectedPrNumber ? `#${selectedPrNumber}` : "None",
            color: "text-cyan-400",
          },
          {
            label: "Open",
            value: String(openCount),
            color: "text-amber-400",
          },
        ].map((s) => (
          <div
            key={s.label}
            className="glass rounded-xl p-4 border border-border/40 text-center"
          >
            <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 glass rounded-xl border border-border/40 p-3">
        <p className="text-xs text-muted-foreground">
          Open PRs from GitHub MCP for your selected repository.
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={onRefresh}
          disabled={loading}
          className="gap-1.5 border-border/50"
        >
          {loading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Refreshing
            </>
          ) : (
            <>
              <RefreshCcw className="w-3.5 h-3.5" />
              Refresh
            </>
          )}
        </Button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
          {error}
        </div>
      ) : null}

      <div className="space-y-3">
        {pullRequests.length === 0 && !loading ? (
          <div className="glass rounded-xl border border-border/40 p-5 text-sm text-muted-foreground">
            No open pull requests found for this repository.
          </div>
        ) : null}

        {pullRequests.map((pr) => (
          <div
            key={pr.number}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(pr.number)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(pr.number);
              }
            }}
            className={`glass rounded-xl border p-5 cursor-pointer transition-colors ${selectedPrNumber === pr.number ? "border-blue-500/70 bg-blue-500/15" : "border-border/40"}`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-amber-500/10 text-amber-400 border-amber-500/30"
                  >
                    ● OPEN
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    PR #{pr.number}
                  </span>
                </div>
                <h4 className="text-sm font-semibold text-foreground mb-1">
                  {pr.title}
                </h4>
                <p className="text-xs font-mono text-muted-foreground/60">
                  {pr.headRef} → {pr.baseRef}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[10px] text-muted-foreground">author</p>
                <p className="text-sm font-semibold text-foreground">{pr.author}</p>
              </div>
            </div>
            <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border/30">
              <div
                className={`flex items-center gap-1.5 text-xs ${selectedPrNumber === pr.number ? "text-blue-300" : "text-muted-foreground"}`}
              >
                <CheckCircle2 className="w-3 h-3" />
                {selectedPrNumber === pr.number ? "Selected" : "Click to select"}
              </div>
              <a
                href={pr.url}
                target="_blank"
                rel="noreferrer"
                className="ml-auto flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
              >
                <Github className="w-3 h-3" /> View on GitHub{" "}
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Pipeline Tab ─────────────────────────────────────────────────────────────

function PipelineTab({
  stage,
  terminalLines,
  agentStatuses,
  owner,
  repo,
  branch,
  targetUrl,
  slackChannel,
  githubMcpMode,
  prSearch,
  pullRequests,
  selectedPrNumber,
  prsLoading,
  prsError,
  ragInsights,
  onConfigChange,
  onPrSearchChange,
  onRefreshPrs,
  onSelectPr,
  onRun,
  running,
  controlPlaneRepo,
}: {
  stage: PipelineStage;
  terminalLines: TerminalLine[];
  agentStatuses: Record<string, AgentStatus>;
  owner: string;
  repo: string;
  branch: string;
  targetUrl: string;
  slackChannel: string;
  githubMcpMode: "docker" | "npx";
  prSearch: string;
  pullRequests: OpenPullRequest[];
  selectedPrNumber: number | null;
  prsLoading: boolean;
  prsError: string;
  ragInsights: RagInsight[];
  onConfigChange: (field: string, value: string) => void;
  onPrSearchChange: (value: string) => void;
  onRefreshPrs: () => void;
  onSelectPr: (prNumber: number) => void;
  onRun: () => void;
  running: boolean;
  controlPlaneRepo: string;
}) {
  return (
    <div className="space-y-6">
      <div className="glass rounded-xl border border-border/40 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground">
              Multi-Agent Pipeline
            </h2>
            <p className="text-sm text-muted-foreground">
              Control plane:{" "}
              <span className="text-foreground font-mono">{controlPlaneRepo}</span>
              {" · "}
              Target app repo (PRs/tests):{" "}
              <span className="text-foreground font-mono">
                {owner}/{repo}
              </span>
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Select a PR from the target repo, then start the end-to-end flow with Slack notifications.
            </p>
          </div>
          <Button
            onClick={onRun}
            disabled={running || !selectedPrNumber || !owner || !repo || !targetUrl}
            className="glow-cyan bg-primary text-primary-foreground hover:bg-primary/90 gap-2"
          >
            {running ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Running…
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Start Flow
              </>
            )}
          </Button>
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          <input
            value={owner}
            onChange={(e) => onConfigChange("owner", e.target.value)}
            placeholder="GitHub owner"
            className="h-10 rounded-lg border border-border/50 bg-background/70 px-3 text-sm text-foreground"
          />
          <input
            value={repo}
            onChange={(e) => onConfigChange("repo", e.target.value)}
            placeholder="Repository name"
            className="h-10 rounded-lg border border-border/50 bg-background/70 px-3 text-sm text-foreground"
          />
          <input
            value={branch}
            onChange={(e) => onConfigChange("branch", e.target.value)}
            placeholder="Base branch"
            className="h-10 rounded-lg border border-border/50 bg-background/70 px-3 text-sm text-foreground"
          />
          <input
            value={targetUrl}
            onChange={(e) => onConfigChange("targetUrl", e.target.value)}
            placeholder="Target URL"
            className="h-10 rounded-lg border border-border/50 bg-background/70 px-3 text-sm text-foreground"
          />
          <input
            value={slackChannel}
            onChange={(e) => onConfigChange("slackChannel", e.target.value)}
            placeholder="Slack channel (e.g. #new-channel)"
            className="h-10 rounded-lg border border-border/50 bg-background/70 px-3 text-sm text-foreground"
          />
          <select
            value={githubMcpMode}
            onChange={(e) => onConfigChange("githubMcpMode", e.target.value)}
            className="h-10 rounded-lg border border-border/50 bg-background/70 px-3 text-sm text-foreground"
          >
            <option value="npx">GitHub MCP via npx</option>
            <option value="docker">GitHub MCP via docker</option>
          </select>
        </div>

        <div className="grid md:grid-cols-[1fr_auto] gap-3 items-center">
          <input
            value={prSearch}
            onChange={(e) => onPrSearchChange(e.target.value)}
            placeholder="Search open PRs by title, number, author, branch"
            className="h-10 rounded-lg border border-border/50 bg-background/70 px-3 text-sm text-foreground"
          />
          <Button
            type="button"
            onClick={onRefreshPrs}
            disabled={prsLoading || !owner || !repo}
            variant="outline"
            className="gap-2 border-border/50"
          >
            {prsLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading PRs
              </>
            ) : (
              <>
                <RefreshCcw className="w-4 h-4" />
                Load Open PRs
              </>
            )}
          </Button>
        </div>

        {prsError ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {prsError}
          </div>
        ) : null}

        <div className="rounded-xl border border-border/40 overflow-hidden">
          <div className="max-h-64 overflow-y-auto divide-y divide-border/30">
            {pullRequests.length === 0 && !prsLoading ? (
              <div className="px-3 py-4 text-xs text-muted-foreground">
                No open PRs loaded yet.
              </div>
            ) : (
              pullRequests.map((pr) => (
                <button
                  key={pr.number}
                  type="button"
                  onClick={() => onSelectPr(pr.number)}
                  className={`w-full text-left px-3 py-2.5 transition-colors ${selectedPrNumber === pr.number ? "bg-blue-500/20 border-l-2 border-blue-400" : "hover:bg-muted/30"}`}
                >
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>PR #{pr.number}</span>
                    <span>•</span>
                    <span>{pr.author}</span>
                    <span>•</span>
                    <span>{pr.headRef} → {pr.baseRef}</span>
                  </div>
                  <div className="text-sm text-foreground truncate">{pr.title}</div>
                </button>
              ))
            )}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Selected PR: {selectedPrNumber ? `#${selectedPrNumber}` : "None"}
        </p>
      </div>

      <RagInsightBanner insights={ragInsights} />

      <PipelineFlowViz stage={stage} agentStatuses={agentStatuses} terminalLines={terminalLines} />
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { data: session } = useSession();
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Pipeline simulation state
  const [stage, setStage] = useState<PipelineStage>("idle");
  const [running, setRunning] = useState(false);
  const [terminalLines, setTerminalLines] = useState<TerminalLine[]>([]);
  const [agentStatuses, setAgentStatuses] = useState<
    Record<string, AgentStatus>
  >({
    architect: "idle",
    scripter: "idle",
    watchdog: "idle",
    healer: "idle",
    courier: "idle",
  });
  const [agentTasks, setAgentTasks] = useState<Record<string, string>>({
    architect: "Awaiting trigger…",
    scripter: "Awaiting test plan…",
    watchdog: "Monitoring metrics…",
    healer: "On standby…",
    courier: "Ready to notify…",
  });
  const [tests, setTests] = useState<TestResult[]>(INITIAL_TESTS);
  const [owner, setOwner] = useState("harshkg23");
  const [repo, setRepo] = useState("sample-dashboard-app");
  const [branch, setBranch] = useState("main");
  const [targetUrl, setTargetUrl] = useState("http://localhost:5173");
  const [slackChannel, setSlackChannel] = useState("#new-channel");
  const [githubMcpMode, setGithubMcpMode] = useState<"docker" | "npx">("npx");
  const [prSearch, setPrSearch] = useState("");
  const [openPrs, setOpenPrs] = useState<OpenPullRequest[]>([]);
  const [selectedPrNumber, setSelectedPrNumber] = useState<number | null>(null);
  const [prsLoading, setPrsLoading] = useState(false);
  const [prsError, setPrsError] = useState("");
  const [pipelineError, setPipelineError] = useState("");
  const [ragInsights, setRagInsights] = useState<RagInsight[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<string | undefined>(undefined);
  const [courierType, setCourierType] = useState<"pr" | "issue" | undefined>(undefined);

  const { events: sessionEvents, clearEvents } = useSessionWebSocket(activeSessionId);
  const processedEventCountRef = useRef(0);
  const agentStatusesRef = useRef(agentStatuses);
  const sessionStatusRef = useRef<string | undefined>(sessionStatus);
  const courierTypeRef = useRef<"pr" | "issue" | undefined>(courierType);

  const addLines = useCallback((lines: TerminalLine[], offset = 0) => {
    lines.forEach((line, i) => {
      setTimeout(
        () => {
          setTerminalLines((prev) => [...prev, { ...line, ts: now() }]);
        },
        offset + i * 300,
      );
    });
  }, []);

  const fetchPullRequests = useCallback(async () => {
    if (!owner || !repo) return;

    setPrsLoading(true);
    setPrsError("");
    try {
      const query = new URLSearchParams({
        owner,
        repo,
        state: "open",
        github_mcp_mode: githubMcpMode,
      });
      if (prSearch.trim()) {
        query.set("query", prSearch.trim());
      }

      const response = await fetch(`/api/agent/pull-requests?${query.toString()}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error ?? "Failed to load pull requests");
      }

      const prs = (data?.pull_requests ?? []) as OpenPullRequest[];
      setOpenPrs(prs);
      setSelectedPrNumber((prev) => {
        if (prs.length === 0) return null;
        const selectedStillExists = prev ? prs.some((pr) => pr.number === prev) : false;
        return selectedStillExists ? prev : prs[0].number;
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to fetch pull requests";
      setPrsError(message);
      setOpenPrs([]);
      setSelectedPrNumber(null);
    } finally {
      setPrsLoading(false);
    }
  }, [owner, repo, prSearch, githubMcpMode]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/agent/pipeline-config");
        const data = (await res.json()) as { slack_channel?: string };
        const slack = data.slack_channel?.trim();
        if (!cancelled && slack) setSlackChannel(slack);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!owner || !repo) return;
    void fetchPullRequests();
  }, [fetchPullRequests, owner, repo]);

  useEffect(() => {
    agentStatusesRef.current = agentStatuses;
  }, [agentStatuses]);

  useEffect(() => {
    sessionStatusRef.current = sessionStatus;
  }, [sessionStatus]);

  useEffect(() => {
    courierTypeRef.current = courierType;
  }, [courierType]);

  useEffect(() => {
    processedEventCountRef.current = 0;
  }, [activeSessionId]);

  useEffect(() => {
    if (!activeSessionId || sessionEvents.length === 0) return;

    const newEvents = sessionEvents.slice(processedEventCountRef.current);
    if (newEvents.length === 0) return;
    processedEventCountRef.current = sessionEvents.length;

    const nextStatuses = { ...agentStatusesRef.current };
    let nextSessionStatus = sessionStatusRef.current;
    let nextCourierType = courierTypeRef.current;

    for (const event of newEvents) {
      if (event.name === "agent.started") {
        const agent = mapEventAgentToFlowAgent((event.payload as any)?.agent_name);
        if (agent) {
          nextStatuses[agent] = "running";
          const message = (event.payload as any)?.message;
          if (typeof message === "string" && message.trim()) {
            const isRagMessage = message.includes("RAG:");
            addLines([{
              text: `[${agent.toUpperCase()}] ${message}`,
              type: isRagMessage ? "rag" : "agent",
              ts: "",
            }], 0);

            if (isRagMessage) {
              setRagInsights(prev => [...prev, {
                agent: agent.toUpperCase(),
                message,
                timestamp: new Date().toLocaleTimeString(),
              }]);
            }
          }
        }
      }

      if (event.name === "agent.completed") {
        const agent = mapEventAgentToFlowAgent((event.payload as any)?.agent_name);
        if (agent) {
          nextStatuses[agent] = "success";
        }
      }

      if (event.name === "session.status_changed") {
        const status = (event.payload as any)?.status;
        if (typeof status === "string") {
          nextSessionStatus = status;
        }
      }

      if (event.name === "courier.pr_created") {
        nextCourierType = "pr";
        nextStatuses.courier = "success";
      }

      if (event.name === "courier.issue_created") {
        nextCourierType = "pr";
        nextStatuses.courier = "success";
      }

      if (event.name === "pipeline.completed") {
        const status = (event.payload as any)?.status;
        if (typeof status === "string") {
          nextSessionStatus = status;
        }
      }
    }

    agentStatusesRef.current = nextStatuses;
    sessionStatusRef.current = nextSessionStatus;
    courierTypeRef.current = nextCourierType;

    setAgentStatuses(nextStatuses);
    setSessionStatus(nextSessionStatus);
    setCourierType(nextCourierType);
    setAgentTasks(buildAgentTasks(nextStatuses));
    setStage(derivePipelineStage(nextStatuses, nextSessionStatus, nextCourierType));
  }, [activeSessionId, sessionEvents, addLines]);

  const runPipeline = useCallback(async () => {
    if (running || !selectedPrNumber) return;

    const selectedPr = openPrs.find((pr) => pr.number === selectedPrNumber);
    if (!selectedPr) {
      setPipelineError("Selected PR not found in loaded PR list.");
      return;
    }

    setPipelineError("");
    setRunning(true);
    const sessionId = `pipeline_${Date.now()}`;
    clearEvents();
    processedEventCountRef.current = 0;
    setActiveSessionId(sessionId);
    setSessionStatus("running");
    setCourierType(undefined);
    setRagInsights([]);
    setStage("architect");
    setTerminalLines([]);
    setTests(INITIAL_TESTS.map((t) => ({ ...t, status: "pending", duration: "—" })));
    setAgentStatuses({
      architect: "running",
      scripter: "idle",
      watchdog: "idle",
      healer: "idle",
      courier: "idle",
    });
    setAgentTasks({
      architect: `Analyzing PR #${selectedPr.number}...`,
      scripter: "Awaiting test plan…",
      watchdog: "Monitoring metrics…",
      healer: "On standby…",
      courier: "Ready to notify…",
    });

    addLines(
      [
        { text: `Pipeline triggered for ${owner}/${repo} PR #${selectedPr.number}`, type: "system", ts: "" },
        { text: `Selected PR: ${selectedPr.title}`, type: "info", ts: "" },
        { text: "Slack start notification queued...", type: "agent", ts: "" },
      ],
      0,
    );

    try {
      const response = await fetch("/api/agent/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner,
          repo,
          branch,
          target_url: targetUrl,
          github_mcp_mode: githubMcpMode,
          selected_pr: {
            number: selectedPr.number,
            title: selectedPr.title,
            url: selectedPr.url,
            headRef: selectedPr.headRef,
            baseRef: selectedPr.baseRef,
          },
          slack_channel: slackChannel,
          session_id: sessionId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error ?? "Pipeline execution failed");
      }

      const results = data?.results;
      const resultDetails = Array.isArray(results?.details) ? results.details : [];
      const mappedTests: TestResult[] = resultDetails.slice(0, 14).map((test: any, index: number) => ({
        id: index + 1,
        name: String(test?.name ?? `Step ${index + 1}`),
        flow: "Pipeline",
        status: test?.status === "passed" ? "passed" : "failed",
        duration: typeof test?.duration_ms === "number" ? `${(test.duration_ms / 1000).toFixed(1)}s` : "—",
        error: test?.error ? String(test.error) : undefined,
      }));
      if (mappedTests.length > 0) {
        setTests(mappedTests);
      }

      const finalStage: PipelineStage =
        results?.failed > 0
          ? "courier_pr"
          : "complete";
      setStage(finalStage);
      setAgentStatuses({
        architect: "success",
        scripter: results?.failed > 0 ? "error" : "success",
        watchdog: results?.failed > 0 ? "success" : "idle",
        healer: results?.failed > 0 ? "success" : "idle",
        courier: "success",
      });
      setAgentTasks({
        architect: `PR #${selectedPr.number} analyzed`,
        scripter:
          results?.failed > 0
            ? `${results.failed} test(s) failed`
            : `${results?.passed ?? 0} test(s) passed`,
        watchdog: results?.failed > 0 ? "Anomalies analyzed" : "No anomalies",
        healer: results?.failed > 0 ? "RCA prepared" : "No healing needed",
        courier: "Slack + GitHub notifications completed",
      });

      addLines(
        [
          {
            text: `Pipeline completed. Passed: ${results?.passed ?? 0}/${results?.total ?? 0}`,
            type: results?.failed > 0 ? "warn" : "success",
            ts: "",
          },
          {
            text: results?.failed > 0
              ? "Failure summary sent to Slack and remediation pipeline triggered."
              : "Success summary sent to Slack.",
            type: "agent",
            ts: "",
          },
        ],
        0,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Pipeline execution failed";
      setPipelineError(message);
      setStage("courier_pr");
      setAgentStatuses((prev) => ({
        ...prev,
        architect: prev.architect === "running" ? "error" : prev.architect,
        scripter: "error",
        courier: "error",
      }));
      setAgentTasks((prev) => ({
        ...prev,
        courier: "Failed to dispatch notifications",
      }));
      addLines([{ text: `Pipeline error: ${message}`, type: "error", ts: "" }], 0);
    } finally {
      setRunning(false);
      setActiveSessionId(null);
    }
  }, [
    running,
    selectedPrNumber,
    openPrs,
    owner,
    repo,
    branch,
    targetUrl,
    githubMcpMode,
    slackChannel,
    addLines,
    clearEvents,
  ]);

  const TAB_TITLES: Record<Tab, string> = {
    overview: "Overview",
    pipeline: "Pipeline",
    agents: "Agents",
    tests: "Test Results",
    terminal: "Live Terminal",
    rca: "RCA Reports",
    prs: "PR Tracker",
  };

  const handleConfigChange = useCallback((field: string, value: string) => {
    if (field === "owner") setOwner(value.trim());
    if (field === "repo") setRepo(value.trim());
    if (field === "branch") setBranch(value.trim());
    if (field === "targetUrl") setTargetUrl(value.trim());
    if (field === "slackChannel") setSlackChannel(value.trim());
    if (field === "githubMcpMode") {
      setGithubMcpMode(value === "docker" ? "docker" : "npx");
    }
  }, []);

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar
        activeTab={activeTab}
        setTab={setActiveTab}
        session={session}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
      />

      {/* Main content */}
      <main className="flex-1 md:ml-64 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="shrink-0 h-14 border-b border-border/40 glass-strong flex items-center px-6 gap-4">
          <button
            className="md:hidden text-muted-foreground hover:text-foreground"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-base font-bold text-foreground">
              {TAB_TITLES[activeTab]}
            </h1>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setStage("idle");
                setTerminalLines([]);
                setTests(INITIAL_TESTS);
                setAgentStatuses({
                  architect: "idle",
                  scripter: "idle",
                  watchdog: "idle",
                  healer: "idle",
                  courier: "idle",
                });
              }}
              className="gap-1.5 h-8 text-xs border-border/50"
            >
              <RefreshCcw className="w-3 h-3" />
              Reset
            </Button>
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 overflow-y-auto p-6">
          {pipelineError ? (
            <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
              {pipelineError}
            </div>
          ) : null}

          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
            >
              {activeTab === "overview" && (
                <OverviewTab
                  agentStatuses={agentStatuses}
                  agentTasks={agentTasks}
                  stage={stage}
                  terminalLines={terminalLines}
                  tests={tests}
                  ragInsights={ragInsights}
                />
              )}
              {activeTab === "pipeline" && (
                <PipelineTab
                  stage={stage}
                  terminalLines={terminalLines}
                  agentStatuses={agentStatuses}
                  owner={owner}
                  repo={repo}
                  branch={branch}
                  targetUrl={targetUrl}
                  slackChannel={slackChannel}
                  githubMcpMode={githubMcpMode}
                  prSearch={prSearch}
                  pullRequests={openPrs}
                  selectedPrNumber={selectedPrNumber}
                  prsLoading={prsLoading}
                  prsError={prsError}
                  ragInsights={ragInsights}
                  onConfigChange={handleConfigChange}
                  onPrSearchChange={setPrSearch}
                  onRefreshPrs={() => {
                    void fetchPullRequests();
                  }}
                  onSelectPr={setSelectedPrNumber}
                  onRun={runPipeline}
                  running={running}
                  controlPlaneRepo={CONTROL_PLANE_REPO}
                />
              )}
              {activeTab === "agents" && (
                <AgentsTab
                  agentStatuses={agentStatuses}
                  agentTasks={agentTasks}
                />
              )}
              {activeTab === "tests" && <TestsTab tests={tests} />}
              {activeTab === "terminal" && (
                <div className="h-[calc(100vh-8rem)]">
                  <LiveTerminalPanel lines={terminalLines} />
                </div>
              )}
              {activeTab === "rca" && <RcaTab stage={stage} />}
              {activeTab === "prs" && (
                <PrsTab
                  pullRequests={openPrs}
                  loading={prsLoading}
                  error={prsError}
                  selectedPrNumber={selectedPrNumber}
                  onSelect={setSelectedPrNumber}
                  onRefresh={() => {
                    void fetchPullRequests();
                  }}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
