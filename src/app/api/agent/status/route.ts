// ============================================================================
// GET /api/agent/status
//
// Returns the health status of the Playwright MCP integration
// and agent readiness for the dashboard.
// ============================================================================

import { NextResponse } from "next/server";
import { sessionManager } from "@/lib/mcp/session-manager";
import type { AgentStatus } from "@/lib/mcp/types";

export const dynamic = "force-dynamic";

export async function GET() {
    // Single MongoDB fetch — count statuses in memory to avoid redundant queries
    const allSessions = await sessionManager.listSessions();
    const running   = allSessions.filter((s) => s.status === "running");
    const completed = allSessions.filter((s) => s.status === "completed");
    const failed    = allSessions.filter((s) => s.status === "failed");

    let state: AgentStatus["state"] = "idle";
    let message = "Agent is idle and ready for test execution";
    let currentTask: string | undefined;

    if (running.length > 0) {
        state = "running";
        message = `Executing ${running.length} test session(s)`;
        currentTask = `Running tests for session ${running[0].id}`;
    }

    const status: AgentStatus = {
        state,
        message,
        last_updated: new Date().toISOString(),
        current_task: currentTask,
    };

    return NextResponse.json({
        status: "ready",
        agent: status,
        sessions: {
            total: allSessions.length,
            running: running.length,
            completed: completed.length,
            failed: failed.length,
        },
        capabilities: [
            "browser_navigate",
            "browser_click",
            "browser_type",
            "browser_snapshot",
            "browser_hover",
            "browser_select_option",
            "browser_wait_for_page",
        ],
    });
}
