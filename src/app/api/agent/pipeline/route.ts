// POST /api/agent/pipeline — TollGate full flow (GitHub MCP → tests → Healer → PR).
// Accepts Hack-nocturne-style JSON or Luminus /repos UI (camelCase).

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { AgentOrchestrator } from "@/lib/mcp/orchestrator";
import {
  notifyPipelineStarted,
  notifyTestsPassed,
  notifyTestsFailed,
  notifyPipelineError,
} from "@/lib/notifications/slack";

type SelectedPrPayload = {
  number?: number;
  title?: string;
  url?: string;
  headRef?: string;
  baseRef?: string;
};

function parseBody(body: Record<string, unknown>): {
  owner: string;
  repo: string;
  branch: string;
  target_url: string;
  github_mcp_mode: "docker" | "npx";
  selected_pr?: SelectedPrPayload;
  slack_channel?: string;
  session_id?: string;
  github_token?: string;
} {
  const envOwner =
    process.env.TOLLGATE_DEFAULT_OWNER?.trim() ||
    process.env.SENTINELQA_DEFAULT_OWNER?.trim() ||
    "";
  const envRepo =
    process.env.TOLLGATE_DEFAULT_REPO?.trim() ||
    process.env.SENTINELQA_DEFAULT_REPO?.trim() ||
    "";
  const envBranch =
    process.env.TOLLGATE_DEFAULT_BRANCH?.trim() ||
    process.env.SENTINELQA_DEFAULT_BRANCH?.trim() ||
    "main";
  const envTarget =
    process.env.TOLLGATE_TARGET_URL?.trim() ||
    process.env.SENTINELQA_TARGET_URL?.trim() ||
    process.env.TARGET_URL?.trim() ||
    "";

  const selected =
    (body.selected_pr as SelectedPrPayload | undefined) ??
    (body.selectedPr as SelectedPrPayload | undefined);

  const modeRaw = String(
    body.github_mcp_mode ?? body.githubMcpMode ?? body.mode ?? "npx",
  ).toLowerCase();
  const github_mcp_mode = modeRaw === "docker" ? "docker" : "npx";

  const owner = String(body.owner ?? envOwner).trim();
  const repo = String(body.repo ?? envRepo).trim();
  const branch = String(body.branch ?? envBranch).trim();
  const target_url = String(
    body.target_url ?? body.targetUrl ?? envTarget,
  ).trim();

  const envSlack = (
    process.env.SLACK_NOTIFICATION_CHANNEL ||
    process.env.PIPELINE_SLACK_DEFAULT_CHANNEL ||
    ""
  ).trim();
  const slack_channel = String(
    body.slack_channel ?? body.slackChannel ?? envSlack,
  ).trim();
  const session_id = String(body.session_id ?? body.sessionId ?? "").trim();
  const github_token = body.github_token
    ? String(body.github_token)
    : undefined;

  return {
    owner,
    repo,
    branch,
    target_url,
    github_mcp_mode,
    selected_pr: selected,
    slack_channel: slack_channel || undefined,
    session_id: session_id || undefined,
    github_token,
  };
}

export async function POST(request: NextRequest) {
  const envOwner =
    process.env.TOLLGATE_DEFAULT_OWNER?.trim() ||
    process.env.SENTINELQA_DEFAULT_OWNER?.trim() ||
    "";
  const envRepo =
    process.env.TOLLGATE_DEFAULT_REPO?.trim() ||
    process.env.SENTINELQA_DEFAULT_REPO?.trim() ||
    "";
  const envBranch =
    process.env.TOLLGATE_DEFAULT_BRANCH?.trim() ||
    process.env.SENTINELQA_DEFAULT_BRANCH?.trim() ||
    "main";
  const envTarget =
    process.env.TOLLGATE_TARGET_URL?.trim() ||
    process.env.SENTINELQA_TARGET_URL?.trim() ||
    process.env.TARGET_URL?.trim() ||
    "";

  let owner = envOwner;
  let repo = envRepo;
  let branch = envBranch;
  let target_url = envTarget;
  let slackChannel: string | undefined;

  try {
    let raw: Record<string, unknown>;
    try {
      raw = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body. Provide a valid pipeline payload." },
        { status: 400 },
      );
    }

    const parsed = parseBody(raw);
    owner = parsed.owner;
    repo = parsed.repo;
    branch = parsed.branch;
    target_url = parsed.target_url;
    slackChannel = parsed.slack_channel;

    if (!owner || !repo || !target_url) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: owner, repo, target_url (set in body or TOLLGATE_TARGET_URL / SENTINELQA_TARGET_URL / TARGET_URL in .env).",
        },
        { status: 400 },
      );
    }

    const pipelineTarget = parsed.selected_pr?.number
      ? `${target_url} (PR #${parsed.selected_pr.number})`
      : target_url;
    void notifyPipelineStarted(owner, repo, branch, pipelineTarget, {
      channel: slackChannel,
    });

    const effectiveBranch = parsed.selected_pr?.headRef || branch;

    const orchestrator = new AgentOrchestrator({
      owner,
      repo,
      branch: effectiveBranch,
      targetUrl: target_url,
      githubToken: parsed.github_token,
      githubMcpMode: parsed.github_mcp_mode,
      sessionId: parsed.session_id,
      selectedPr: parsed.selected_pr?.number
        ? {
            number: parsed.selected_pr.number,
            title: parsed.selected_pr.title ?? "",
            headRef: parsed.selected_pr.headRef ?? effectiveBranch,
            baseRef: parsed.selected_pr.baseRef ?? branch,
          }
        : undefined,
    });

    const { codeContext, testPlan, results, courier, pr } =
      await orchestrator.runFullPipeline();

    if (results.failed > 0) {
      const failedSteps = results.results
        .filter((r) => r.status !== "passed")
        .map((r) => ({ step: r.name, error: r.error }));
      void notifyTestsFailed(
        owner,
        repo,
        target_url,
        results.passed,
        results.failed,
        results.total,
        results.duration_ms,
        results.session_id,
        failedSteps,
        { channel: slackChannel },
      );
    } else {
      void notifyTestsPassed(
        owner,
        repo,
        target_url,
        results.total,
        results.duration_ms,
        results.session_id,
        { channel: slackChannel },
      );
    }

    return NextResponse.json({
      pipeline: "completed",
      repo: `${owner}/${repo}`,
      session_id: results.session_id,
      code_context_length: codeContext.length,
      test_plan: testPlan,
      results: {
        total: results.total,
        passed: results.passed,
        failed: results.failed,
        duration_ms: results.duration_ms,
        details: results.results,
      },
      courier: courier
        ? {
            type: courier.type,
            url: courier.url,
            number: courier.number,
          }
        : undefined,
      pr: pr
        ? {
            url: pr.url,
            number: pr.number,
            files: pr.files,
          }
        : undefined,
    });
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Internal server error";
    console.error("[API /agent/pipeline] Error:", errorMessage);

    if (owner && repo) {
      void notifyPipelineError(owner, repo, "Pipeline Execution", errorMessage, {
        channel: slackChannel,
      });
    }

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
