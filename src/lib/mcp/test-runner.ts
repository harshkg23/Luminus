// ============================================================================
// TollGate - Test Runner Engine
//
// Receives a test plan (markdown), parses it into individual steps,
// translates each step into MCP tool calls, executes them against a
// headless browser, and returns aggregated results.
// ============================================================================

import { PlaywrightMCPClient } from "./playwright-client";
import {
    TestPlanInput,
    TestResult,
    TestRunOutput,
    TestStep,
} from "./types";

/**
 * Parse a markdown test plan into executable test steps.
 *
 * Expected markdown format:
 * ```
 * ## Scenario: Login Flow
 * 1. Navigate to /auth
 * 2. Type "user@example.com" into "Email"
 * 3. Type "password123" into "Password"
 * 4. Click "Sign In"
 * 5. Assert page contains "Welcome"
 * ```
 */
/** Strip wrapping ASCII quotes and trim (e.g. `"/"` → `/`). */
function normalizeNavigateTarget(raw: string): string {
    let s = raw.trim();
    if (
        (s.startsWith('"') && s.endsWith('"')) ||
        (s.startsWith("'") && s.endsWith("'"))
    ) {
        s = s.slice(1, -1).trim();
    }
    return s;
}

export function parseTestPlan(markdown: string): TestStep[] {
    const steps: TestStep[] = [];
    const lines = markdown.split("\n");

    let stepIndex = 0;

    for (const line of lines) {
        const trimmed = line.trim();

        // Match numbered executable steps only.
        const stepMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
        if (!stepMatch) continue;

        const description = stepMatch[2];
        const step = parseStepDescription(description, ++stepIndex);
        if (step) {
            steps.push(step);
        }
    }

    return steps;
}

/**
 * Parse a single step description into a TestStep with action, target, and value.
 */
function parseStepDescription(
    description: string,
    index: number
): TestStep | null {
    const normalized = description.trim().replace(/\s+/g, " ");
    const lower = normalized.toLowerCase();

    // Allow legacy verbs (e.g. "Take a snapshot of the page") as well as the newer ones.
    if (
        !/^(navigate|type|enter|fill|click|assert|wait|select|hover|take|snapshot)\b/i.test(
            normalized
        )
    ) {
        return null;
    }

    // Backward-compatible support for snapshot steps
    const snapshotMatch = normalized.match(
        /^(?:take\s+)?(?:a\s+)?snapshot(?:\s+of\s+the\s+page)?\.?$/i
    );
    if (snapshotMatch) {
        return {
            index,
            description: normalized,
            action: "snapshot",
        };
    }
    
    const selectQuotedMatch = normalized.match(
        /select\s+["'](.+?)["']\s+from\s+["'](.+?)["']/i
    );
    const selectLooseMatch = normalized.match(/select\s+(.+?)\s+from\s+(.+?)$/i);
    if (lower.startsWith("select")) {
        const optionValue =
            selectQuotedMatch?.[1]?.trim() ?? selectLooseMatch?.[1]?.trim();
        const selectTarget =
            selectQuotedMatch?.[2]?.trim() ?? selectLooseMatch?.[2]?.trim();
        if (!optionValue || !selectTarget) {
            return null;
        }
        return {
            index,
            description: normalized,
            action: "select",
            target: selectTarget,
            value: optionValue,
        };
    }

    const navMatch = normalized.match(/navigate\s+to\s+(.+)$/i);
    if (navMatch) {
        const value = normalizeNavigateTarget(navMatch[1] ?? "");
        if (!value) {
            return null;
        }
        return {
            index,
            description: normalized,
            action: "navigate",
            value,
        };
    }

    const clickQuotedMatch = normalized.match(/click\s+(?:the\s+|on\s+)?["'](.+?)["']/i);
    const clickLooseMatch = normalized.match(
        /click\s+(?:the\s+|on\s+)?(.+?)(?:\s+(?:button|link|element))?\.?$/i
    );
    if (lower.includes("click")) {
        const clickTarget =
            clickQuotedMatch?.[1]?.trim() ?? clickLooseMatch?.[1]?.trim();
        if (!clickTarget) {
            return null;
        }
        return {
            index,
            description: normalized,
            action: "click",
            target: clickTarget,
        };
    }

    const typeMatch = normalized.match(
        /(?:type|enter|fill)\s+["'](.+?)["']\s+(?:into|in)\s+["']?(.+?)["']?\.?$/i
    );
    if (typeMatch) {
        return {
            index,
            description: normalized,
            action: "type",
            target: typeMatch[2].trim(),
            value: typeMatch[1],
        };
    }

    const assertQuotedMatch = normalized.match(
        /assert\s+(?:the\s+)?(?:page\s+)?contains?\s+["'](.+?)["']\.?$/i
    );
    const assertLooseMatch = assertQuotedMatch
        ? null
        : normalized.match(
              /assert\s+(?:the\s+)?(?:page\s+)?contains?\s+(.+?)\.?$/i
          );
    const assertValueRaw =
        assertQuotedMatch?.[1] ?? assertLooseMatch?.[1];
    if (assertValueRaw) {
        const cleanedValue = assertValueRaw.trim().replace(/^["']|["']$/g, "");
        return {
            index,
            description: normalized,
            action: "assert",
            value: cleanedValue,
        };
    }

    const waitMatch = normalized.match(
        /wait\s+(?:for\s+)?(\d+)\s*(?:seconds?|ms|milliseconds?)?/i
    );
    if (waitMatch) {
        let ms = parseInt(waitMatch[1], 10);
        if (lower.includes("second")) ms *= 1000;
        return {
            index,
            description: normalized,
            action: "wait",
            value: String(ms),
        };
    }

    if (lower.includes("hover")) {
        const hoverMatch = normalized.match(
            /hover\s+(?:over\s+)?(?:the\s+)?(.+)/i
        );
        return {
            index,
            description: normalized,
            action: "hover",
            target: hoverMatch?.[1]?.trim() ?? normalized,
        };
    }

    return null;
}

export class TestRunner {
    private client: PlaywrightMCPClient;

    constructor(client: PlaywrightMCPClient) {
        this.client = client;
    }

    /**
     * Execute a full test plan and return aggregated results.
     */
    async runTestPlan(input: TestPlanInput): Promise<TestRunOutput> {
        const startTime = Date.now();
        const results: TestResult[] = [];

        const steps = parseTestPlan(input.test_plan);

        if (steps.length === 0) {
            return {
                session_id: input.session_id,
                results: [
                    {
                        name: "Parse test plan",
                        status: "failed",
                        duration_ms: 0,
                        error: "No executable steps found in test plan",
                    },
                ],
                total: 1,
                passed: 0,
                failed: 1,
                duration_ms: Date.now() - startTime,
            };
        }

        console.log(
            `[Test Runner] Executing ${steps.length} steps for session ${input.session_id}`
        );

        if (steps[0].action !== "navigate") {
            const navResult = await this.executeStep(
                {
                    index: 0,
                    description: `Navigate to ${input.target_url}`,
                    action: "navigate",
                    value: input.target_url,
                },
                input.target_url
            );
            results.push(navResult);

            if (navResult.status === "failed") {
                return this.buildOutput(input.session_id, results, startTime);
            }
        }

        const skippedIndices = new Set<number>();
        for (const step of steps) {
            if (skippedIndices.has(step.index)) continue;

            console.log(`[Test Runner] Step ${step.index}: ${step.description}`);

            const result = await this.executeStep(step, input.target_url);
            results.push(result);

            if (result.status === "failed" && step.action === "navigate") {
                console.log(
                    `[Test Runner] Navigation failure at step ${step.index}, skipping to next suite.`
                );

                let foundNextNav = false;
                for (const s of steps) {
                    if (s.index <= step.index) continue;
                    if (s.action === "navigate") {
                        foundNextNav = true;
                        break;
                    }
                    skippedIndices.add(s.index);
                    results.push({
                        name: `Step ${s.index}: ${s.description}`,
                        status: "skipped",
                        duration_ms: 0,
                    });
                }
                if (!foundNextNav) break;
            }
        }

        return this.buildOutput(input.session_id, results, startTime);
    }

    /**
     * Execute a single test step using MCP tool calls.
     */
    private async executeStep(step: TestStep, targetUrl: string): Promise<TestResult> {
        const stepStart = Date.now();
        const name = `Step ${step.index}: ${step.description}`;

        try {
            let response;
            let ref: string | undefined;

            if (["click", "type", "hover", "select"].includes(step.action) && step.target) {
                const snapResponse = await this.client.snapshot();
                if (snapResponse.success && snapResponse.content) {
                    const snapshotText = snapResponse.content
                        .filter((c) => c.type === "text")
                        .map((c) => c.text)
                        .join("\n");
                    ref = this.findRefFromSnapshot(snapshotText, step.target, step.action);
                    if (!ref) {
                        console.log(`[Test Runner] Notice: Could not find strict ref for target "${step.target}" in ${step.action}. Falling back to loose targeting.`);
                    } else {
                        console.log(`[Test Runner] Resolved target "${step.target}" to ref ${ref} for ${step.action}()`);
                    }
                }
            }

            switch (step.action) {
                case "navigate":
                    response = await this.client.navigate(
                        this.resolveNavigationUrl(step.value!, targetUrl)
                    );
                    break;

                case "click":
                    response = await this.client.click(step.target!, ref);
                    break;

                case "type":
                    response = await this.client.type(step.target!, step.value!, ref);
                    break;

                case "hover":
                    response = await this.client.hover(step.target!, ref);
                    break;

                case "snapshot":
                    response = await this.client.snapshot();
                    break;

                case "wait":
                    response = await this.client.wait(
                        parseInt(step.value ?? "2000", 10)
                    );
                    break;

                case "assert":
                    response = await this.executeAssertion(step.value!);
                    break;

                case "select":
                    response = await this.client.selectOption(
                        step.target!,
                        [step.value!],
                        ref
                    );
                    break;

                default:
                    response = { success: false, error: `Unknown action: ${step.action}` };
            }

            const duration_ms = Date.now() - stepStart;

            if (response.success) {
                return { name, status: "passed", duration_ms };
            }

            let snapshot: string | undefined;
            try {
                const snapResponse = await this.client.snapshot();
                if (snapResponse.success && snapResponse.content) {
                    snapshot = snapResponse.content
                        .filter((c) => c.type === "text")
                        .map((c) => c.text)
                        .join("\n");
                }
            } catch {
                // Ignore snapshot errors during failure capture
            }

            return {
                name,
                status: "failed",
                duration_ms,
                error: response.error ?? "Unknown error",
                accessibility_snapshot: snapshot,
            };
        } catch (err) {
            return {
                name,
                status: "failed",
                duration_ms: Date.now() - stepStart,
                error: err instanceof Error ? err.message : String(err),
            };
        }
    }

    /**
     * Assert that the page contains expected text by checking the snapshot.
     */
    private async executeAssertion(
        expectedText: string
    ): Promise<{ success: boolean; error?: string; content?: Array<{ type: string; text?: string }> }> {
        const snapshot = await this.client.snapshot();

        if (!snapshot.success) {
            return {
                success: false,
                error: `Failed to take snapshot for assertion: ${snapshot.error}`,
            };
        }

        const pageText =
            snapshot.content
                ?.filter((c) => c.type === "text")
                .map((c) => c.text ?? "")
                .join("\n") ?? "";

        const normalizedPage = pageText.toLowerCase();
        const normalizedExpected = expectedText.toLowerCase();

        if (normalizedPage.includes(normalizedExpected)) {
            return { success: true, content: snapshot.content };
        }

        const words = normalizedExpected.split(/\s+/).filter((w) => w.length > 2);
        if (words.length > 1 && words.every((w) => normalizedPage.includes(w))) {
            return { success: true, content: snapshot.content };
        }

        return {
            success: false,
            error: `Assertion failed: page does not contain "${expectedText}"`,
        };
    }

    private findRefFromSnapshot(snapshotText: string, targetContent: string, action: string): string | undefined {
        if (!targetContent) return undefined;
        const lines = snapshotText.split('\n');
        const targetLower = targetContent.toLowerCase();
        
        // Preferred roles based on action type to disambiguate identical text
        const preferRoles = action === 'type' ? ['textbox', 'combobox', 'searchbox'] : ['button', 'link', 'checkbox', 'radio', 'switch'];

        let bestRef: string | undefined;
        let bestScore = -1;

        for (const line of lines) {
            const lowerLine = line.toLowerCase();
            if (lowerLine.includes(targetLower)) {
                const refMatch = line.match(/\[ref=(e\d+)\]/);
                if (refMatch) {
                    const ref = refMatch[1];
                    let score = 0;
                    
                    // Exact text match in quotes gets higher score
                    if (lowerLine.includes(`"${targetLower}"`)) score += 5;
                    else score += 1;

                    // Standard Playwright syntax is `- role "name" [ref=XYZ]`
                    // Role matching
                    if (preferRoles.some(role => lowerLine.includes(`- ${role}`))) {
                        score += 10;
                    }

                    if (score > bestScore) {
                        bestScore = score;
                        bestRef = ref;
                    }
                }
            }
        }

        return bestRef;
    }

    private resolveNavigationUrl(rawUrl: string, targetUrl: string): string {
        const candidate = rawUrl.trim();
        if (!candidate) {
            throw new Error("Navigate step is missing a URL");
        }

        let resolved: URL;
        try {
            resolved = new URL(candidate, targetUrl);
        } catch {
            throw new Error(`Invalid navigation URL: "${rawUrl}"`);
        }

        const allowedProtocols = new Set(["http:", "https:"]);
        if (!allowedProtocols.has(resolved.protocol)) {
            throw new Error(
                `Disallowed navigation URL protocol "${resolved.protocol}" for URL "${resolved.toString()}". Only http and https are allowed.`
            );
        }

        const targetOrigin = new URL(targetUrl).origin;
        if (resolved.origin !== targetOrigin) {
            throw new Error(
                `Disallowed cross-origin navigation to "${resolved.toString()}". Expected origin "${targetOrigin}".`
            );
        }

        return resolved.toString();
    }

    /**
     * Build the final aggregated output.
     */
    private buildOutput(
        sessionId: string,
        results: TestResult[],
        startTime: number
    ): TestRunOutput {
        return {
            session_id: sessionId,
            results,
            total: results.length,
            passed: results.filter((r) => r.status === "passed").length,
            failed: results.filter((r) => r.status === "failed").length,
            duration_ms: Date.now() - startTime,
        };
    }
}
