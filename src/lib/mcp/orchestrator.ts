// ============================================================================
// TollGate — Agent Orchestrator
//
// The brain that ties everything together:
//   1. GitHub MCP → reads repo code, detects changes
//   2. AI Agent (simulated for now) → generates test plans from code
//   3. Playwright MCP → executes the test plan in a real browser
//   4. Results → stored in session, ready for dashboard
//
// When the real LangGraph AI agent is ready (Aaskar's part),
// the `generateTestPlan()` method gets replaced with an AI call.
// Everything else stays the same.
// ============================================================================

import { execSync } from "child_process";
import { GitHubMCPClient } from "./github-client";
import { PlaywrightMCPClient } from "./playwright-client";
import { TestRunner } from "./test-runner";
import { sessionManager } from "./session-manager";
import { CourierAgent, CourierResult } from "./courier";
import { emitSessionEvent } from "../websocket/server";
import { applyPipelineWebhook } from "../pipeline/state";
import { aiEngine } from "./ai-engine-client";
import type { HealerOnlyResult } from "./ai-engine-client";
import { generateTestFiles, buildPRBody, buildTollgateSelectedPrComment } from "./test-writer";
import type { PRBodyOptions } from "./test-writer";
import { applyFileEdits, applyPatchToExistingBranch } from "../courier/apply-patch";
import {
  reportPipelineStart,
  reportTestFailure,
  reportPRCreated,
  reportIssueCreated,
  reportPipelineComplete,
} from "../notion/report-service";
import type { TestPlanInput, TestRunOutput } from "./types";

// ── Orchestrator Config ─────────────────────────────────────────────────────

export interface SelectedPrInfo {
    number: number;
    title: string;
    headRef: string;
    baseRef: string;
}

export interface OrchestratorConfig {
    /** GitHub repo owner */
    owner: string;
    /** GitHub repo name */
    repo: string;
    /** Branch to watch (or PR head branch when running against a PR) */
    branch: string;
    /** Target URL of the deployed app to test */
    targetUrl: string;
    /** GitHub PAT */
    githubToken?: string;
    /** How to start GitHub MCP: "docker" or "npx" */
    githubMcpMode?: "docker" | "npx";
    /** Optional client-provided session id for live progress tracking */
    sessionId?: string;
    /** When testing a specific PR, its metadata (head/base branches) */
    selectedPr?: SelectedPrInfo;
}

// ── Agent Orchestrator ──────────────────────────────────────────────────────

export class AgentOrchestrator {
    private config: OrchestratorConfig;
    private githubClient: GitHubMCPClient;
    private playwrightClient: PlaywrightMCPClient;

    constructor(config: OrchestratorConfig) {
        this.config = config;
        this.githubClient = new GitHubMCPClient(config.githubToken);
        this.playwrightClient = new PlaywrightMCPClient({ headless: true });
    }

    // ── Full Pipeline ─────────────────────────────────────────────────────────

    /**
     * Run the complete pipeline:
     *   1. Connect to GitHub MCP → read repo code
     *   2. Analyze code → generate test plan
     *   3. Connect to Playwright MCP → execute tests
     *   4. Return results
     */
    async runFullPipeline(): Promise<{
        codeContext: string;
        testPlan: string;
        results: TestRunOutput;
        courier?: CourierResult;
        pr?: { url?: string; number?: number; files: string[] };
    }> {
        console.log("\n🚀 Starting TollGate Pipeline...\n");

        const sessionId = this.config.sessionId ?? `pipeline_${Date.now()}`;
        const ts = () => new Date().toISOString();

        await sessionManager.createSession({
          session_id: sessionId,
          target_url: this.config.targetUrl,
          test_plan: "pending",
        });
        await sessionManager.updateStatus(sessionId, "running");

        // Reset the SSE pipeline state so the dashboard starts fresh
        applyPipelineWebhook({ action: "reset" });

        // Emit pipeline started
        emitSessionEvent(sessionId, "pipeline.started", {
          session_id: sessionId, status: "started", timestamp: ts(),
        });

        // Notion: log pipeline start (fire-and-forget — never block the pipeline)
        reportPipelineStart(this.config.repo, sessionId).catch((e) =>
          console.warn(`[Notion] pipeline start log failed: ${(e as Error).message}`)
        );

        // ── Step 1: Read code from GitHub ───────────────────────────────────
        console.log("📦 Step 1: Reading code from GitHub...");
        applyPipelineWebhook({ step: "code_push", status: "running", message: "Reading repository code from GitHub" });
        emitSessionEvent(sessionId, "agent.started", {
          session_id: sessionId, agent_name: "architect", status: "started", message: "Reading repository code", timestamp: ts(),
        });
        await sessionManager.updateAgentStatus(sessionId, "architect", "running");
        const codeContext = await this.readRepoCode();
        console.log(`   ✅ Got code context (${codeContext.length} chars)\n`);
        applyPipelineWebhook({ step: "code_push", status: "completed", message: `Got code context (${codeContext.length} chars)` });
        await sessionManager.updateAgentStatus(sessionId, "architect", "success");

        // ── Step 1b: Fetch PR diff (needed by both test planner and healer) ──
        console.log("📝 Step 1b: Fetching PR diff...");
        const targetDiffResult = await this.getTargetRepoDiff();
        const fallbackDiff = this.getRecentGitDiff();
        const effectiveDiff = targetDiffResult.diff || fallbackDiff.diff;
        const effectiveFiles = targetDiffResult.changedFiles.length
            ? targetDiffResult.changedFiles
            : fallbackDiff.changedFiles;
        const prChangedFiles: string[] = effectiveFiles;
        if (effectiveDiff) {
            console.log(`   ✅ Got PR diff (${effectiveDiff.length} chars, ${effectiveFiles.length} changed files)\n`);
        } else {
            console.log(`   ⚠️  No diff available (${effectiveFiles.length} changed files detected)\n`);
        }

        // ── Step 2: Generate test plan from PR diff + code context ───────────
        console.log("🧠 Step 2: AI Agent analyzing PR and generating test plan...");
        applyPipelineWebhook({ step: "architect", status: "running", message: `Analyzing ${effectiveFiles.length} changed files + generating tests` });
        emitSessionEvent(sessionId, "agent.started", {
          session_id: sessionId, agent_name: "scripter", status: "started",
          message: `Analyzing ${effectiveFiles.length} changed files + generating tests`, timestamp: ts(),
        });
        await sessionManager.updateAgentStatus(sessionId, "scripter", "running");
        let testPlan: string;
        if (aiEngine.isConnected) {
            try {
                const planResult = await aiEngine.generateTestPlan(
                    codeContext,
                    effectiveFiles,
                    this.config.targetUrl,
                    effectiveDiff
                );
                testPlan = planResult.test_plan;
                console.log(`   ✅ Test plan generated by AI engine (${testPlan.split("\n").length} lines)\n`);

                if (planResult.rag_architect_matches > 0) {
                    console.log(`   🧠 RAG Insight: ${planResult.rag_architect_insights}`);
                    emitSessionEvent(sessionId, "agent.started", {
                        session_id: sessionId,
                        agent_name: "architect",
                        status: "started",
                        message: `🧠 RAG: Taking insights from ${planResult.rag_architect_matches} similar past test plan(s)`,
                        timestamp: ts(),
                    });
                }
            } catch (err) {
                console.warn(
                    `   ⚠️  AI engine generateTestPlan failed (${(err as Error).message}); falling back to local generator.`
                );
                testPlan = this.generateTestPlan(codeContext);
            }
        } else {
            console.log("   ⚠️  AI engine not configured; using local test plan generator.");
            testPlan = this.generateTestPlan(codeContext);
        }

        applyPipelineWebhook({ step: "architect", status: "completed", message: `Test plan: ${testPlan.split("\n").length} lines` });
        emitSessionEvent(sessionId, "agent.completed", {
          session_id: sessionId, agent_name: "scripter", status: "completed", message: `Generated ${testPlan.split("\n").length} lines`, timestamp: ts(),
        });
        await sessionManager.updateAgentStatus(sessionId, "scripter", "success");

        // ── Step 3: Execute tests via Playwright MCP ────────────────────────
        console.log("🎭 Step 3: Executing tests via Playwright MCP...");
        applyPipelineWebhook({ step: "scripter", status: "running", message: "Executing tests via Playwright MCP" });
        emitSessionEvent(sessionId, "agent.started", {
          session_id: sessionId, agent_name: "playwright", status: "started", message: "Running tests in browser", timestamp: ts(),
        });
        const input: TestPlanInput = {
            test_plan: testPlan,
            target_url: this.config.targetUrl,
            session_id: sessionId,
        };

        await sessionManager.updateStatus(sessionId, "running");
        emitSessionEvent(sessionId, "session.status_changed", {
          session_id: sessionId, status: "running", timestamp: ts(),
        });

        await this.playwrightClient.start();
        const runner = new TestRunner(this.playwrightClient);
        const results = await runner.runTestPlan(input);
        await this.playwrightClient.stop();

        await sessionManager.setOutput(sessionId, results);

        console.log(`   ✅ Tests completed: ${results.passed}/${results.total} passed\n`);
        applyPipelineWebhook({ step: "scripter", status: "completed", message: `Tests: ${results.passed}/${results.total} passed` });
        applyPipelineWebhook({
          step: "tests_gate", status: "completed",
          message: results.failed > 0 ? `${results.failed} failures → routing to Healer` : `All ${results.total} tests passed`,
          path: results.failed > 0 ? "watchdog" : "courier",
        });

        emitSessionEvent(sessionId, "session.status_changed", {
          session_id: sessionId, status: results.failed > 0 ? "failed" : "completed", timestamp: ts(),
        });

        // ── Step 4: Healer (RCA + proposed fix) via LangGraph AI Engine ─────
        let healerOutput: HealerOnlyResult | null = null;
        if (results.failed > 0 && aiEngine.isConnected) {
            console.log("🩺 Step 4: Healer agent running RCA via LangGraph...");
            applyPipelineWebhook({ step: "healer", status: "running", message: "Running root cause analysis via LangGraph" });
            emitSessionEvent(sessionId, "agent.started", {
              session_id: sessionId, agent_name: "healer", status: "started",
              message: "Running root cause analysis", timestamp: ts(),
            });

            try {
                const prHeadSnapshots =
                    await this.fetchPrHeadFileSnapshotsForHealer(effectiveFiles);
                if (prHeadSnapshots.length > 0) {
                    console.log(
                        `   📎 Healer: attached ${prHeadSnapshots.length} PR-head file snapshot(s) for exact edits`
                    );
                }

                healerOutput = await aiEngine.runHealerOnly({
                    repoUrl: `${this.config.owner}/${this.config.repo}`,
                    changedFiles: effectiveFiles,
                    targetUrl: this.config.targetUrl,
                    sessionId,
                    testResults: results.results as import("./types").TestResult[],
                    gitDiff: effectiveDiff,
                    branch: this.config.branch,
                    prHeadFileContents: prHeadSnapshots,
                });
                if (healerOutput) {
                    console.log(`   ✅ Healer: rca_type=${healerOutput.rca_type}, confidence=${healerOutput.confidence_score}`);

                    if (healerOutput.rag_healer_matches > 0) {
                        console.log(`   🧠 RAG Insight: ${healerOutput.rag_healer_insights}`);
                        emitSessionEvent(sessionId, "agent.started", {
                            session_id: sessionId,
                            agent_name: "healer",
                            status: "started",
                            message: `🧠 RAG: Taking insights from ${healerOutput.rag_healer_matches} similar past fix(es) — rca_type match`,
                            timestamp: ts(),
                        });
                    }

                    if (healerOutput.proposed_patch) {
                        console.log(`   📋 Healer generated a code fix patch (${healerOutput.proposed_patch.length} chars)`);
                    }
                    if (healerOutput.proposed_fix) {
                        console.log(`   💡 Proposed fix: ${healerOutput.proposed_fix.substring(0, 120)}...`);
                    }
                    applyPipelineWebhook({ step: "healer", status: "completed", message: `RCA: ${healerOutput.rca_type} (confidence ${healerOutput.confidence_score})` });
                    emitSessionEvent(sessionId, "agent.completed", {
                      session_id: sessionId, agent_name: "healer", status: "completed",
                      message: `RCA: ${healerOutput.rca_type} (confidence ${healerOutput.confidence_score})`,
                      timestamp: ts(),
                    });
                    await sessionManager.updateAgentStatus(sessionId, "healer", "success");
                }
            } catch (healerErr) {
                console.warn(`   ⚠️  Healer failed: ${(healerErr as Error).message}`);
                applyPipelineWebhook({ step: "healer", status: "failed", message: `Healer error: ${(healerErr as Error).message}` });
                await sessionManager.updateAgentStatus(sessionId, "healer", "error");
            }
        }

        // ── Step 5: Courier — report failures via issue ─────────────────────
        let courierResult: CourierResult | undefined;
        if (results.failed > 0) {
            await sessionManager.updateAgentStatus(sessionId, "watchdog", "running");
            const failLogs = results.results
                .filter((r) => r.status === "failed")
                .map((r) => `FAIL  ${r.name}\n      ${r.error ?? "unknown error"}`)
                .join("\n\n");
            reportTestFailure(
                this.config.repo,
                sessionId,
                results.failed,
                results.total,
                failLogs
            ).catch((e) =>
                console.warn(`[Notion] test failure log failed: ${(e as Error).message}`)
            );
            await sessionManager.updateAgentStatus(sessionId, "watchdog", "success");

            console.log("📨 Step 5: Watchdog agent reporting failures...");
            applyPipelineWebhook({ step: "watchdog", status: "running", message: "Reporting failures via GitHub Issue" });
            await sessionManager.updateAgentStatus(sessionId, "watchdog", "running");
            const courier = new CourierAgent(this.config.githubToken);
            try {
                const failedTests = results.results
                    .filter((r) => r.status === "failed")
                    .map((r) => `- **${r.name}**: ${r.error ?? "unknown error"}`)
                    .join("\n");

                const rcaSection = healerOutput
                    ? `### Root Cause Analysis\n- **Type**: ${
                          healerOutput.rca_type
                      }\n- **Confidence**: ${((healerOutput.confidence_score ?? 0) * 100).toFixed(
                          0
                      )}%\n\n${healerOutput.rca_report ?? ""}\n\n### Proposed Fix\n${
                          healerOutput.proposed_fix ?? "N/A"
                      }`
                    : `### Root Cause Analysis\nHealer agent not available — manual investigation required.`;

                courierResult = await courier.createIssueReport({
                    session_id: sessionId,
                    owner: this.config.owner,
                    repo: this.config.repo,
                    title: `[TollGate] Test failures detected (${results.failed}/${results.total})`,
                    body: `### Failed Tests\n\n${failedTests}\n\n${rcaSection}\n\n### Summary\n- Total: ${results.total}\n- Passed: ${results.passed}\n- Failed: ${results.failed}\n- Duration: ${results.duration_ms}ms`,
                    labels: ["tollgate", "bug"],
                });
                console.log(
                    `   ✅ Courier: Created ${courierResult.type} ${courierResult.url ?? ""}\n`
                );
                if (courierResult.success) {
                    applyPipelineWebhook({ step: "watchdog", status: "completed", message: `Created issue: ${courierResult.url ?? ""}` });
                    await sessionManager.updateAgentStatus(sessionId, "watchdog", "success");
                } else {
                    applyPipelineWebhook({ step: "watchdog", status: "failed", message: "Watchdog failed to create report" });
                    await sessionManager.updateAgentStatus(sessionId, "watchdog", "error");
                }
            } catch (courierErr) {
                console.warn(`   ⚠️  Watchdog failed: ${(courierErr as Error).message}`);
                await sessionManager.updateAgentStatus(sessionId, "watchdog", "error");
            } finally {
                await courier.stop();
            }

            if (courierResult && courierResult.success) {
                emitSessionEvent(sessionId, "courier.issue_created", {
                    session_id: sessionId,
                    type: courierResult.type,
                    url: courierResult.url,
                    number: courierResult.number,
                    timestamp: ts(),
                });
                await sessionManager.setCourierResult(sessionId, {
                    type: courierResult.type,
                    url: courierResult.url,
                    number: courierResult.number,
                });
                if (courierResult.url) {
                    reportIssueCreated(
                        this.config.repo,
                        sessionId,
                        courierResult.url,
                        courierResult.number
                    ).catch((e) =>
                        console.warn(`[Notion] issue log failed: ${(e as Error).message}`)
                    );
                }
            }
        } else {
            applyPipelineWebhook({ step: "courier", status: "running", message: "All tests passed — sending success report" });
            await sessionManager.updateAgentStatus(sessionId, "courier", "running");
            applyPipelineWebhook({ step: "courier", status: "completed", message: "All tests passed" });
            await sessionManager.updateAgentStatus(sessionId, "courier", "success");
        }

        // ── Step 6: Unified PR — code fixes + test files ────────────────────
        let prResult: { url?: string; number?: number; files: string[] } | undefined;
        let postFixResults: import("./types").TestRunOutput | null = null;
        const hasFileEdits = (healerOutput?.file_edits?.length ?? 0) > 0 && (healerOutput?.confidence_score ?? 0) > 0.5;
        const hasHealerFix = Boolean(
            hasFileEdits ||
                (Boolean(healerOutput?.proposed_patch?.trim()) && (healerOutput?.confidence_score ?? 0) > 0.5)
        );
        try {
            console.log("📝 Step 6: Writing tests & fixes, opening unified PR...");
            emitSessionEvent(sessionId, "agent.started", {
              session_id: sessionId, agent_name: "test-writer", status: "started",
              message: hasHealerFix
                ? "Generating test files + applying healer code fixes"
                : "Generating Playwright test files",
              timestamp: ts(),
            });

            const testFiles = generateTestFiles(testPlan, this.config.targetUrl);
            const filePaths = testFiles.map((f) => f.path);
            console.log(`   Generated ${testFiles.length} test files: ${filePaths.join(", ")}`);

            const sessionSuffix = sessionId.replace("pipeline_", "");
            const baseBranchName = healerOutput?.fix_branch?.trim() || "tollgate/fix";
            const branchName = `${baseBranchName}-${sessionSuffix}`;

            // When testing a PR, fork from the PR's head branch so all original
            // PR files are included; the fix PR targets the PR's base (e.g. main).
            const { selectedPr } = this.config;
            const sourceBranch = selectedPr?.headRef || this.config.branch;
            const targetBranch = selectedPr?.baseRef || this.config.branch;

            // Use post-fix results for the title if available
            const finalResults = postFixResults ?? results;
            const prTitle = hasHealerFix
                ? selectedPr
                    ? `[TollGate] Fix for PR #${selectedPr.number} (${healerOutput!.rca_type}) — ${finalResults.passed}/${finalResults.total} passed${postFixResults ? " after fix" : ""}`
                    : `[TollGate] Auto-fix + E2E tests (${healerOutput!.rca_type}) — ${finalResults.passed}/${finalResults.total} passed${postFixResults ? " after fix" : ""}`
                : selectedPr
                    ? `[TollGate] E2E tests for PR #${selectedPr.number} (${results.passed}/${results.total} passed)`
                    : `[TollGate] Auto-generated E2E tests (${results.passed}/${results.total} passed)`;

            const prBodyOptions: PRBodyOptions = {
                originalPrNumber: selectedPr?.number,
                originalPrTitle: selectedPr?.title,
                sourceBranch,
                targetBranch,
                originalChangedFiles: prChangedFiles.length > 0 ? prChangedFiles : undefined,
                issueNumber: courierResult?.number,
                targetUrl: this.config.targetUrl,
            };
            const prBody = buildPRBody(sessionId, testPlan, results, testFiles, codeContext.length, healerOutput, prBodyOptions, postFixResults);

            const ghClient = new GitHubMCPClient(this.config.githubToken);
            try {
                await ghClient.start(this.config.githubMcpMode ?? "npx");

                // 6a. Create branch from the PR's head (carries all original PR files)
                console.log(`   📌 Branching from "${sourceBranch}" → "${branchName}"`);
                const branchRes = await ghClient.createBranch(
                    this.config.owner, this.config.repo,
                    branchName, sourceBranch
                );
                if (!branchRes.success) {
                    throw new Error(`Branch creation failed: ${branchRes.error}`);
                }
                console.log(`   ✅ Created branch: ${branchName} (from ${sourceBranch})`);

                // 6b. Apply healer code fixes (if available)
                if (hasHealerFix) {
                    console.log(`   🔧 Applying healer code fixes...`);
                    const githubToken = this.config.githubToken
                        ?? process.env.GITHUB_PERSONAL_ACCESS_TOKEN
                        ?? process.env.GITHUB_PAT ?? "";

                    let fixApplied = false;

                    if (hasFileEdits && healerOutput!.file_edits!.length > 0) {
                        console.log(`   📝 Applying ${healerOutput!.file_edits!.length} search/replace edit(s)...`);
                        const editResult = await applyFileEdits({
                            owner: this.config.owner,
                            repo: this.config.repo,
                            branch: branchName,
                            edits: healerOutput!.file_edits!,
                            sessionId,
                            githubToken,
                        });
                        fixApplied = editResult.success;
                        if (editResult.success) {
                            console.log(`   ✅ Healer code fixes applied via search/replace`);
                        } else {
                            console.warn(`   ⚠️  File edits failed: ${editResult.error}`);
                        }
                    }

                    if (!fixApplied && healerOutput?.proposed_patch?.trim()) {
                        console.log(`   🔄 Falling back to unified diff patch...`);
                        const patchResult = await applyPatchToExistingBranch({
                            owner: this.config.owner,
                            repo: this.config.repo,
                            branch: branchName,
                            proposedPatch: healerOutput.proposed_patch,
                            sessionId,
                            githubToken,
                        });
                        fixApplied = patchResult.success;
                        if (patchResult.success) {
                            console.log(`   ✅ Healer code fixes applied via unified diff`);
                        } else {
                            console.warn(`   ⚠️  Unified diff also failed: ${patchResult.error}`);
                        }
                    }

                    if (!fixApplied) {
                        console.warn(`   ❌ Could not apply healer fixes — PR will contain tests only`);
                    }
                }

                // 6b-2. Re-run tests after fix to verify
                if (hasHealerFix) {
                    console.log(`   🔄 Step 7: Re-running tests after fix to verify...`);
                    emitSessionEvent(sessionId, "agent.started", {
                      session_id: sessionId, agent_name: "playwright", status: "started",
                      message: "Re-running tests after healer fix", timestamp: ts(),
                    });
                    try {
                        await this.playwrightClient.start();
                        const verifyRunner = new TestRunner(this.playwrightClient);
                        postFixResults = await verifyRunner.runTestPlan({
                            test_plan: testPlan,
                            target_url: this.config.targetUrl,
                            session_id: `${sessionId}_verify`,
                        });
                        await this.playwrightClient.stop();
                        console.log(`   ✅ Post-fix results: ${postFixResults.passed}/${postFixResults.total} passed`);

                        emitSessionEvent(sessionId, "agent.completed", {
                          session_id: sessionId, agent_name: "playwright", status: "completed",
                          message: `Post-fix: ${postFixResults.passed}/${postFixResults.total} passed`,
                          timestamp: ts(),
                        });
                    } catch (rerunErr) {
                        console.warn(`   ⚠️  Post-fix re-run failed: ${(rerunErr as Error).message}`);
                    }
                }

                // 6c. Push test files
                const pushRes = await ghClient.pushFiles(
                    this.config.owner, this.config.repo, branchName,
                    testFiles.map((f) => ({ path: f.path, content: f.content })),
                    hasHealerFix
                        ? `fix+test(e2e): TollGate healer fix + auto-generated tests\n\nSession: ${sessionId}\nRCA: ${healerOutput?.rca_type ?? "unknown"}\nTests: ${results.passed}/${results.total} passed`
                        : `test(e2e): auto-generated by TollGate pipeline\n\nSession: ${sessionId}\nTests: ${results.passed}/${results.total} passed`
                );
                if (!pushRes.success) {
                    throw new Error(`File push failed: ${pushRes.error}`);
                }
                console.log(`   ✅ Pushed ${testFiles.length} test files`);

                // 6d. Open fix PR targeting the base branch (e.g. main)
                console.log(`   📬 Opening PR: ${branchName} → ${targetBranch}`);
                const prRes = await ghClient.createPullRequest(
                    this.config.owner, this.config.repo,
                    prTitle, prBody, branchName, targetBranch
                );
                if (!prRes.success) {
                    throw new Error(`PR creation failed: ${prRes.error}`);
                }

                const prText = prRes.content?.find((c) => c.type === "text")?.text ?? "{}";
                let prUrl: string | undefined;
                let prNum: number | undefined;
                try {
                    const parsed = JSON.parse(prText);
                    prUrl = parsed.html_url ?? parsed.url;
                    prNum = parsed.number;
                } catch {
                    const urlMatch = prText.match(/https:\/\/github\.com\/[^\s"]+\/pull\/\d+/);
                    if (urlMatch) prUrl = urlMatch[0];
                    const numMatch = prText.match(/"number":\s*(\d+)/);
                    if (numMatch) prNum = parseInt(numMatch[1], 10);
                }

                prResult = { url: prUrl, number: prNum, files: filePaths };
                console.log(`   ✅ Opened PR #${prNum ?? "?"}: ${prUrl ?? "(url pending)"}`);
                if (hasHealerFix) {
                    console.log(`   🩺 PR includes healer code fixes for: ${healerOutput!.rca_type}`);
                }
                if (selectedPr) {
                    console.log(`   🔗 Fix PR branches from PR #${selectedPr.number}'s head — all original files included\n`);
                }

                emitSessionEvent(sessionId, "courier.pr_created", {
                  session_id: sessionId, type: "pr",
                  url: prUrl, number: prNum,
                  includes_fix: hasHealerFix,
                  timestamp: ts(),
                });

                if (prUrl) {
                  reportPRCreated(
                    this.config.repo, sessionId, prUrl, prNum,
                    healerOutput?.confidence_score ?? (results.failed === 0 ? 0.95 : 0.7)
                  ).catch((e) =>
                    console.warn(`[Notion] test PR log failed: ${(e as Error).message}`)
                  );
                }
            } finally {
                await ghClient.stop();
            }
        } catch (prErr) {
            console.warn(`   ⚠️  PR creation failed: ${(prErr as Error).message}`);
            console.warn(`   Tests were generated but could not be pushed to GitHub.`);
        }

        // Use post-fix results for final status if available
        const finalResults = postFixResults ?? results;

        // Emit pipeline.completed with final results
        emitSessionEvent(sessionId, "pipeline.completed", {
          session_id: sessionId,
          status: finalResults.failed > 0 ? "failed" : "completed",
          results_summary: {
            total: finalResults.total, passed: finalResults.passed,
            failed: finalResults.failed, duration_ms: finalResults.duration_ms,
          },
          pr: prResult ? { url: prResult.url, number: prResult.number } : undefined,
          timestamp: ts(),
        });

        // Notify: comment on the original PR with results
        if (prResult?.url && this.config.selectedPr?.number) {
            const ghToken = this.config.githubToken
                ?? process.env.GITHUB_PERSONAL_ACCESS_TOKEN
                ?? process.env.GITHUB_PAT ?? "";
            if (ghToken) {
                try {
                    const commentBody = buildTollgateSelectedPrComment({
                        originalPrNumber: this.config.selectedPr.number,
                        fixPrUrl: prResult.url,
                        fixPrNumber: prResult.number,
                        sessionId,
                        targetUrl: this.config.targetUrl,
                        preResults: results,
                        postResults: postFixResults,
                        healer: healerOutput,
                        changedFiles: prChangedFiles,
                        testPlanPreview: testPlan?.trim() || undefined,
                    });

                    const commentRes = await fetch(
                        `https://api.github.com/repos/${this.config.owner}/${this.config.repo}/issues/${this.config.selectedPr.number}/comments`,
                        {
                            method: "POST",
                            headers: {
                                Authorization: `Bearer ${ghToken}`,
                                Accept: "application/vnd.github+json",
                                "Content-Type": "application/json",
                            },
                            body: JSON.stringify({ body: commentBody }),
                        }
                    );
                    if (commentRes.ok) {
                        console.log(`   💬 Posted notification on PR #${this.config.selectedPr.number}`);
                    } else {
                        console.warn(`   ⚠️  PR comment failed: ${commentRes.status}`);
                    }
                } catch (notifErr) {
                    console.warn(`   ⚠️  Notification failed: ${(notifErr as Error).message}`);
                }
            }
        }

        // ── Store resolution in RAG vector DB for future retrieval ────────
        if (prResult?.url) {
            console.log("   💾 Storing fix + test plan in RAG vector DB...");
            const failedSteps = (finalResults.results ?? [])
                .filter(r => r.status === "failed")
                .map(r => ({
                    name: r.name ?? "unknown",
                    error: (r.error ?? "").slice(0, 500),
                }));

            aiEngine.storeFixInRAG({
                repoUrl: `${this.config.owner}/${this.config.repo}`,
                sessionId,
                rcaType: healerOutput?.rca_type ?? "",
                rcaReport: healerOutput?.rca_report ?? "",
                proposedFix: healerOutput?.proposed_fix ?? "",
                proposedPatch: healerOutput?.proposed_patch ?? "",
                fileEdits: healerOutput?.file_edits?.map(e => ({
                    file: e.file, search: e.search, replace: e.replace,
                })) ?? [],
                targetFiles: healerOutput?.target_files ?? [],
                fixBranch: prResult.files?.[0] ?? "",
                confidenceScore: healerOutput?.confidence_score ?? 0,
                changedFiles: prChangedFiles,
                gitDiff: effectiveDiff?.slice(0, 5000) ?? "",
                testPlan,
                totalTests: finalResults.total,
                passedTests: finalResults.passed,
                failedTestsCount: finalResults.failed,
                failedTests: failedSteps,
                prUrl: prResult.url,
                prNumber: prResult.number,
            }).then(ragRes => {
                console.log(`   ✅ RAG storage: fix=${ragRes.fix_stored}, plan=${ragRes.plan_stored}`);
            }).catch(err => {
                console.warn(`   ⚠️  RAG storage failed: ${(err as Error).message}`);
            });
        }

        // Notion: log pipeline completion
        reportPipelineComplete(
          this.config.repo,
          sessionId,
          results.passed,
          results.total,
          results.duration_ms,
          prResult?.url
        ).catch((e) =>
          console.warn(`[Notion] pipeline complete log failed: ${(e as Error).message}`)
        );

        return { codeContext, testPlan, results, courier: courierResult, pr: prResult };
    }

    // ── Step 1: Read Code from GitHub ─────────────────────────────────────

    /**
     * Connect to GitHub MCP and read repo code.
     * Returns a summary of the repo structure and key files.
     */
    async readRepoCode(): Promise<string> {
        const { owner, repo, branch } = this.config;

        try {
            await this.githubClient.start(this.config.githubMcpMode ?? "npx");

            // Get repo root contents (file listing)
            const rootContents = await this.githubClient.getFileContents(
                owner, repo, "", branch
            );

            let context = `## Repository: ${owner}/${repo} (branch: ${branch})\n\n`;

            if (rootContents.success && rootContents.content) {
                const rootText = rootContents.content
                    .filter((c) => c.type === "text")
                    .map((c) => c.text ?? "")
                    .join("\n");
                context += `### Root Directory:\n${rootText}\n\n`;
            }

            // Try to read common files
            const filesToRead = ["README.md", "package.json", "src/app/page.tsx"];
            for (const file of filesToRead) {
                try {
                    const fileContents = await this.githubClient.getFileContents(
                        owner, repo, file, branch
                    );
                    if (fileContents.success && fileContents.content) {
                        const fileText = fileContents.content
                            .filter((c) => c.type === "text")
                            .map((c) => c.text ?? "")
                            .join("\n");
                        context += `### File: ${file}\n${fileText.substring(0, 500)}\n\n`;
                    }
                } catch {
                    // File might not exist, skip
                }
            }

            // Get recent commits
            const commits = await this.githubClient.listCommits(owner, repo, {
                per_page: 5,
            });
            if (commits.success && commits.content) {
                const commitText = commits.content
                    .filter((c) => c.type === "text")
                    .map((c) => c.text ?? "")
                    .join("\n");
                context += `### Recent Commits:\n${commitText.substring(0, 500)}\n`;
            }

            await this.githubClient.stop();
            return context;
        } catch (err) {
            await this.githubClient.stop();
            console.warn(`  ⚠️  GitHub MCP unavailable: ${(err as Error).message}`);
            return this.getFallbackCodeContext();
        }
    }

    /**
     * Fallback code context when GitHub MCP is not available.
     * Used during development/demos when Docker/PAT isn't set up.
     */
    private getFallbackCodeContext(): string {
        const { owner, repo } = this.config;
        return `## Repository: ${owner}/${repo} (Fallback — GitHub MCP not connected)

### Detected Application Type: Next.js 14 Web App (TollGate)
### Key Routes: /, /auth, /dashboard

### Landing Page (/) UI Content:
- Nav: Link "TollGate"
- Badge: "Agents Online"
- H1: "Autonomous Quality Engineering"
- Paragraph: "AI agents that write, heal, and observe your tests in real-time. Zero maintenance. Infinite coverage."
- Link: "Start Testing" (goes to /auth)
- Button: "Watch Demo"
- Section H2: "How It Works"
- Section H2: "Built for Autonomous QA"
- Cards: "AI Test Generation", "Self-Healing Tests", "Observability Loop"
- Section H2: "The Agent Squad"
- Agent cards: "Planner", "Writer", "Healer", "Observer"
- Section H2: "Remediation Simulator"
- Button: "Simulate Break"
- Footer: "© 2026 TollGate. All rights reserved."

### Auth Page (/auth) UI Content:
- Sign-in form with GitHub, Google, GitLab providers
- Email/password fields
- "Sign In" / "Sign Up" toggle

### Dashboard (/dashboard) UI Content:
- Tabs: Overview, Pipeline, Agents, Tests, Terminal, RCA, PR Tracker
- Pipeline status cards
- Test results table
`;
    }

    // ── Step 2: Generate Test Plan ────────────────────────────────────────

    /**
     * Generate a test plan from code context.
     *
     * 🔮 FUTURE: This gets replaced with an AI call (Claude via LangGraph).
     *    Aaskar's Architect agent will handle this.
     *
     * For now, this generates a reasonable test plan based on the
     * code context and target URL.
     */
    generateTestPlan(codeContext: string): string {
        const { targetUrl } = this.config;

        // Parse what kind of app this is from the context
        const isNextJs = codeContext.toLowerCase().includes("next");
        const hasAuth = codeContext.toLowerCase().includes("auth");
        const hasDashboard = codeContext.toLowerCase().includes("dashboard");

        let plan = `## Auto-Generated Test Plan
### Application: ${targetUrl}
### Generated by: TollGate Architect Agent (simulated)
### Based on: Code analysis of repository

---

## Test Suite 1: Landing Page Verification
1. Navigate to ${targetUrl}
2. Take a snapshot of the page
3. Assert the page contains the main heading
`;

        if (hasAuth) {
            plan += `
## Test Suite 2: Authentication Page
1. Navigate to ${targetUrl}/auth
2. Take a snapshot of the page
3. Assert the page contains a login form
`;
        }

        if (hasDashboard) {
            plan += `
## Test Suite 3: Dashboard Access
1. Navigate to ${targetUrl}/dashboard
2. Take a snapshot of the page
`;
        }

        return plan;
    }

    // ── Git / GitHub Helpers ────────────────────────────────────────────────

    /**
     * Fetch recent diff from the target repo via GitHub API.
     * Uses the last commit vs its parent so the Healer gets real code context.
     */
    /**
     * Fetch recent diff from the target repo via GitHub API.
     * Compares HEAD vs ~10 commits back to catch intentional breakages even if
     * more recent commits (e.g. test files, AI-engine tweaks) have been pushed.
     */
    private async getTargetRepoDiff(): Promise<{ diff: string; changedFiles: string[] }> {
        const token = this.config.githubToken ?? process.env.GITHUB_PERSONAL_ACCESS_TOKEN ?? process.env.GITHUB_PAT;
        const { owner, repo, branch, selectedPr } = this.config;
        if (!token?.trim()) return { diff: "", changedFiles: [] };

        try {
            // When a PR is selected, compare baseRef...headRef directly
            if (selectedPr) {
                const base = selectedPr.baseRef || "main";
                const head = selectedPr.headRef || branch;
                console.log(`[Diff] Comparing PR #${selectedPr.number}: ${base}...${head}`);

                const compareRes = await fetch(
                    `https://api.github.com/repos/${owner}/${repo}/compare/${base}...${head}`,
                    {
                        headers: {
                            Authorization: `Bearer ${token}`,
                            Accept: "application/vnd.github.diff",
                        },
                    }
                );
                if (!compareRes.ok) return { diff: "", changedFiles: [] };
                const diff = (await compareRes.text()).trim();

                const filesRes = await fetch(
                    `https://api.github.com/repos/${owner}/${repo}/compare/${base}...${head}`,
                    {
                        headers: {
                            Authorization: `Bearer ${token}`,
                            Accept: "application/vnd.github+json",
                        },
                    }
                );
                let changedFiles: string[] = [];
                if (filesRes.ok) {
                    const data = (await filesRes.json()) as { files?: Array<{ filename: string }> };
                    changedFiles = (data.files ?? []).map((f) => f.filename);
                }
                console.log(`[Diff] PR #${selectedPr.number}: ${changedFiles.length} files changed`);
                return { diff, changedFiles };
            }

            const branchRef = branch || "main";
            const commitsRes = await fetch(
                `https://api.github.com/repos/${owner}/${repo}/commits?sha=${branchRef}&per_page=10`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        Accept: "application/vnd.github+json",
                        "X-GitHub-Api-Version": "2022-11-28",
                    },
                }
            );
            if (!commitsRes.ok) return { diff: "", changedFiles: [] };
            const commits = (await commitsRes.json()) as Array<{ sha: string; parents?: Array<{ sha: string }> }>;
            if (!commits?.length) return { diff: "", changedFiles: [] };

            const headSha = commits[0].sha;
            const baseSha = commits[commits.length - 1].parents?.[0]?.sha ?? commits[commits.length - 1].sha;

            const compareRes = await fetch(
                `https://api.github.com/repos/${owner}/${repo}/compare/${baseSha}...${headSha}`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        Accept: "application/vnd.github.diff",
                    },
                }
            );
            if (!compareRes.ok) return { diff: "", changedFiles: [] };
            const diff = (await compareRes.text()).trim();

            const filesRes = await fetch(
                `https://api.github.com/repos/${owner}/${repo}/compare/${baseSha}...${headSha}`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        Accept: "application/vnd.github+json",
                    },
                }
            );
            let changedFiles: string[] = [];
            if (filesRes.ok) {
                const data = (await filesRes.json()) as { files?: Array<{ filename: string }> };
                changedFiles = (data.files ?? []).map((f) => f.filename);
            }
            console.log(`[Diff] ${commits.length} commits (${baseSha.substring(0,7)}...${headSha.substring(0,7)}), ${changedFiles.length} files changed`);
            return { diff, changedFiles };
        } catch {
            return { diff: "", changedFiles: [] };
        }
    }

    /**
     * Load full file contents from the PR head (or configured branch) so the Healer
     * can emit search/replace strings that match GitHub exactly.
     */
    private async fetchPrHeadFileSnapshotsForHealer(
        relativePaths: string[]
    ): Promise<Array<{ path: string; content: string }>> {
        const token =
            this.config.githubToken ??
            process.env.GITHUB_PERSONAL_ACCESS_TOKEN ??
            process.env.GITHUB_PAT;
        if (!token?.trim()) return [];

        const headRef =
            this.config.selectedPr?.headRef ?? this.config.branch ?? "main";
        const { owner, repo } = this.config;

        const uiExt = [".tsx", ".jsx", ".ts", ".js", ".css", ".scss", ".html"];
        const uiDirs = [
            "src/app/",
            "src/components/",
            "src/pages/",
            "src/lib/",
            "app/",
            "components/",
            "pages/",
        ];

        const candidates = relativePaths.filter((f) => {
            const lower = f.toLowerCase();
            if (!uiExt.some((ext) => lower.endsWith(ext))) return false;
            return (
                uiDirs.some((d) => f.startsWith(d) || f.includes(`/${d}`)) ||
                f.startsWith("src/")
            );
        });

        const MAX_FILES = 15;
        const MAX_CHARS = 40_000;
        const out: Array<{ path: string; content: string }> = [];

        for (const path of candidates.slice(0, MAX_FILES)) {
            try {
                const encoded = path
                    .split("/")
                    .filter(Boolean)
                    .map(encodeURIComponent)
                    .join("/");
                const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encoded}?ref=${encodeURIComponent(headRef)}`;
                const res = await fetch(url, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        Accept: "application/vnd.github+json",
                        "X-GitHub-Api-Version": "2022-11-28",
                    },
                });
                if (!res.ok) continue;
                const data = (await res.json()) as {
                    content?: string;
                    encoding?: string;
                    type?: string;
                };
                if (data.type !== "file" || data.encoding !== "base64" || !data.content) {
                    continue;
                }
                const b64 = data.content.replace(/\n/g, "");
                let content = Buffer.from(b64, "base64").toString("utf-8");
                const totalLen = content.length;
                if (content.length > MAX_CHARS) {
                    content =
                        content.slice(0, MAX_CHARS) +
                        `\n\n/* ... truncated (file was ${totalLen} chars) */\n`;
                }
                out.push({ path, content });
            } catch {
                // skip file
            }
        }

        return out;
    }

    /** Fallback: local git diff when target repo API is unavailable */
    private getRecentGitDiff(): { diff: string; changedFiles: string[] } {
        try {
            const diff = execSync("git diff HEAD~1", {
                cwd: process.cwd(),
                encoding: "utf-8",
                timeout: 5000,
            }).trim();
            const changedFiles = execSync("git diff --name-only HEAD~1", {
                cwd: process.cwd(),
                encoding: "utf-8",
                timeout: 5000,
            }).trim().split("\n").filter(Boolean);
            return { diff, changedFiles };
        } catch {
            return { diff: "", changedFiles: [] };
        }
    }

    // ── Utility ───────────────────────────────────────────────────────────

    /**
     * Quick health check — can we connect to both MCP servers?
     */
    async healthCheck(): Promise<{
        github: { connected: boolean; tools: string[] };
        playwright: { connected: boolean; tools: string[] };
    }> {
        let githubConnected = false;
        let githubTools: string[] = [];
        let playwrightConnected = false;
        let playwrightTools: string[] = [];

        try {
            await this.githubClient.start(this.config.githubMcpMode ?? "npx");
            githubTools = await this.githubClient.listTools();
            githubConnected = true;
            await this.githubClient.stop();
        } catch {
            githubConnected = false;
        }

        try {
            await this.playwrightClient.start();
            playwrightTools = await this.playwrightClient.listTools();
            playwrightConnected = true;
            await this.playwrightClient.stop();
        } catch {
            playwrightConnected = false;
        }

        return {
            github: { connected: githubConnected, tools: githubTools },
            playwright: { connected: playwrightConnected, tools: playwrightTools },
        };
    }
}
