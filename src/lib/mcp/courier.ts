// ============================================================================
// TollGate — Courier Agent
//
// Closes the autonomous loop: when tests fail, Courier creates a PR (if
// the Healer provided a high-confidence fix) or files a GitHub Issue
// (when confidence is low). Wraps GitHubMCPClient under the hood.
// ============================================================================

import { GitHubMCPClient, GitHubToolResponse } from "./github-client";

// ── Types ───────────────────────────────────────────────────────────────────

export interface CourierPRInput {
  session_id: string;
  owner: string;
  repo: string;
  base_branch: string;
  head_branch: string;
  title: string;
  body: string;
  confidence_score: number;
}

export interface CourierIssueInput {
  session_id: string;
  owner: string;
  repo: string;
  title: string;
  body: string;
  labels?: string[];
}

export interface CourierResult {
  success: boolean;
  type: "pr" | "issue";
  url?: string;
  number?: number;
  error?: string;
}

// ── Courier Agent ───────────────────────────────────────────────────────────

export class CourierAgent {
  private client: GitHubMCPClient;
  private started = false;

  constructor(githubToken?: string) {
    this.client = new GitHubMCPClient(githubToken);
  }

  /** Ensure the MCP client is running */
  private async ensureStarted(): Promise<void> {
    if (!this.started) {
      await this.client.start("npx");
      this.started = true;
    }
  }

  /** Shut down the underlying MCP process */
  async stop(): Promise<void> {
    if (this.started) {
      await this.client.stop();
      this.started = false;
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Create a Pull Request with the proposed fix.
   * Used when healer confidence >= 0.8.
   */
  async createFixPR(input: CourierPRInput): Promise<CourierResult> {
    try {
      await this.ensureStarted();

      const prBody = `## 🛡️ TollGate Auto-Fix

**Session**: \`${input.session_id}\`
**Confidence**: ${(input.confidence_score * 100).toFixed(0)}%

---

${input.body}

---
*This PR was created automatically by the TollGate Courier agent.*`;

      const response: GitHubToolResponse = await this.client.createPullRequest(
        input.owner,
        input.repo,
        input.title,
        prBody,
        input.head_branch,
        input.base_branch
      );

      if (!response.success) {
        return { success: false, type: "pr", error: response.error ?? "Failed to create PR" };
      }

      const prData = this.extractJsonFromResponse(response);
      return {
        success: true,
        type: "pr",
        url: (prData?.html_url ?? prData?.url) as string | undefined,
        number: prData?.number as number | undefined,
      };
    } catch (err) {
      return {
        success: false,
        type: "pr",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Create a GitHub Issue reporting the test failures.
   * Used when healer confidence < 0.8 or no fix is available.
   */
  async createIssueReport(input: CourierIssueInput): Promise<CourierResult> {
    try {
      await this.ensureStarted();

      const labelStr = input.labels?.length
        ? `\n**Labels**: ${input.labels.join(", ")}`
        : "";

      const issueBody = `## 🚨 TollGate — Test Failure Report

**Session**: \`${input.session_id}\`${labelStr}

---

${input.body}

---
*This issue was created automatically by the TollGate Courier agent.*`;

      const response: GitHubToolResponse = await this.client.createIssue(
        input.owner,
        input.repo,
        input.title,
        issueBody
      );

      if (!response.success) {
        return { success: false, type: "issue", error: response.error ?? "Failed to create issue" };
      }

      const issueData = this.extractJsonFromResponse(response);
      return {
        success: true,
        type: "issue",
        url: (issueData?.html_url ?? issueData?.url) as string | undefined,
        number: issueData?.number as number | undefined,
      };
    } catch (err) {
      return {
        success: false,
        type: "issue",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Decide whether to create a PR or Issue based on confidence score.
   * confidence >= 0.8 → PR, otherwise → Issue.
   */
  async dispatch(
    sessionId: string,
    owner: string,
    repo: string,
    branch: string,
    title: string,
    body: string,
    confidence: number,
    labels?: string[]
  ): Promise<CourierResult> {
    if (confidence >= 0.8) {
      return this.createFixPR({
        session_id: sessionId,
        owner,
        repo,
        base_branch: branch,
        head_branch: `tollgate/fix-${sessionId}`,
        title: `[TollGate] ${title}`,
        body,
        confidence_score: confidence,
      });
    }

    return this.createIssueReport({
      session_id: sessionId,
      owner,
      repo,
      title: `[TollGate] ${title}`,
      body,
      labels: labels ?? ["tollgate", "bug"],
    });
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private extractJsonFromResponse(response: GitHubToolResponse): Record<string, unknown> | null {
    const text = response.content?.find((c) => c.type === "text")?.text;
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }
}
