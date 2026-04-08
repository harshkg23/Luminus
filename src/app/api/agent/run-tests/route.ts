// ============================================================================
// POST /api/agent/run-tests
//
// Accepts a test plan and runs it against a target URL using Playwright MCP.
// Returns the test results with pass/fail counts.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { PlaywrightMCPClient } from "@/lib/mcp/playwright-client";
import { TestRunner } from "@/lib/mcp/test-runner";

export const dynamic = "force-dynamic";
import { sessionManager } from "@/lib/mcp/session-manager";
import type { TestPlanInput } from "@/lib/mcp/types";
import {
    notifyTestsPassed,
    notifyTestsFailed,
    notifyPipelineError,
} from "@/lib/notifications/slack";

export async function POST(request: NextRequest) {
    let client: PlaywrightMCPClient | null = null;
    let owner: string | undefined;
    let repo: string | undefined;

    try {
        // ── Parse request body ────────────────────────────────────────────────
        const body = await request.json();
        ({ owner, repo } = body as { owner?: string; repo?: string });
        const { test_plan, target_url, session_id } = body as Partial<TestPlanInput>;

        if (!test_plan || !target_url) {
            return NextResponse.json(
                {
                    error: "Missing required fields: test_plan and target_url",
                },
                { status: 400 }
            );
        }

        // Generate session ID if not provided
        const sid = session_id ?? `session_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

        const input: TestPlanInput = {
            test_plan,
            target_url,
            session_id: sid,
        };

        // ── Create session ──────────────────────────────────────────────────
        const session = await sessionManager.createSession(input);
        await sessionManager.updateStatus(session.id, "running");

        // ── Start MCP client and run tests ──────────────────────────────────
        client = new PlaywrightMCPClient({ headless: true });
        await client.start();

        const runner = new TestRunner(client);
        const output = await runner.runTestPlan(input);

        // ── Save results to session ─────────────────────────────────────────
        await sessionManager.setOutput(session.id, output);

        // ── Cleanup ─────────────────────────────────────────────────────────
        await client.stop();
        client = null;

        // ── 🔔 Notify Slack: test results (fire-and-forget — does not block response) ──
        const repoOwner = owner ?? "—";
        const repoName = repo ?? "run-tests";
        const repoLabel = input.target_url;
        if (output.failed > 0) {
            const failedSteps = output.results
                .filter((r) => r.status !== "passed")
                .map((r) => ({ step: r.name, error: r.error }));
            void notifyTestsFailed(
                repoOwner, repoName, repoLabel,
                output.passed, output.failed, output.total,
                output.duration_ms, session.id, failedSteps
            );
        } else {
            void notifyTestsPassed(
                repoOwner, repoName, repoLabel,
                output.total, output.duration_ms, session.id
            );
        }

        return NextResponse.json(
            {
                session_id: session.id,
                status: output.failed > 0 ? "failed" : "completed",
                total: output.total,
                passed: output.passed,
                failed: output.failed,
                duration_ms: output.duration_ms,
                results: output.results,
            },
            { status: 200 }
        );
    } catch (err) {
        // Cleanup on error
        if (client) {
            try {
                await client.stop();
            } catch {
                // Ignore cleanup errors
            }
        }

        const errorMessage =
            err instanceof Error ? err.message : "Internal server error";
        console.error("[API /agent/run-tests] Error:", errorMessage);

        // 🔔 Notify Slack: pipeline error (fire-and-forget)
        void notifyPipelineError(owner ?? "—", repo ?? "run-tests", "Test Execution", errorMessage);

        return NextResponse.json(
            { error: errorMessage },
            { status: 500 }
        );
    }
}
