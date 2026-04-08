import "server-only";

import { escSlackMrkdwn } from "@/lib/integrations/slack";
import type { PipelineSlackMeta, StepId } from "@/lib/pipeline/types";

type StepStatus = "idle" | "running" | "completed" | "failed";

function pipelineWebhookUrl(): string | undefined {
  const primary = process.env.SLACK_PIPELINE_WEBHOOK_URL?.trim();
  if (primary) return primary;
  return process.env.SLACK_WEBHOOK_URL?.trim();
}

function appLabel(): string {
  return process.env.PIPELINE_SLACK_APP_LABEL?.trim() || "TollGate";
}

function defaults(): Required<
  Pick<PipelineSlackMeta, "repo" | "branch" | "targetUrl">
> & { runKind: string } {
  return {
    repo: process.env.PIPELINE_SLACK_DEFAULT_REPO?.trim() || "—",
    branch: process.env.PIPELINE_SLACK_DEFAULT_BRANCH?.trim() || "—",
    targetUrl: process.env.PIPELINE_SLACK_TARGET_URL?.trim() || "—",
    runKind: "Pipeline run triggered",
  };
}

function mergeMeta(meta: PipelineSlackMeta | undefined): PipelineSlackMeta & {
  repo: string;
  branch: string;
  targetUrl: string;
  runKind: string;
} {
  const d = defaults();
  return {
    ...meta,
    repo: meta?.repo?.trim() || d.repo,
    branch: meta?.branch?.trim() || d.branch,
    targetUrl: meta?.targetUrl?.trim() || d.targetUrl,
    runKind: meta?.runKind?.trim() || d.runKind,
  };
}

function startedAtLabel(): string {
  const d = new Date();
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

type Block = Record<string, unknown>;

function postPayload(text: string, blocks: Block[]): Record<string, unknown> {
  return { text, blocks };
}

function numField(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

export function parsePipelineSlackMeta(raw: unknown): PipelineSlackMeta | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const failedRaw = o.failedSteps;
  let failedSteps: PipelineSlackMeta["failedSteps"];
  if (Array.isArray(failedRaw)) {
    failedSteps = failedRaw
      .map((row) => {
        if (!row || typeof row !== "object") return null;
        const r = row as Record<string, unknown>;
        const step = typeof r.step === "string" ? r.step : "";
        const error = typeof r.error === "string" ? r.error : "";
        if (!step && !error) return null;
        return { step, error };
      })
      .filter(Boolean) as PipelineSlackMeta["failedSteps"];
  }
  return {
    repo: typeof o.repo === "string" ? o.repo : undefined,
    branch: typeof o.branch === "string" ? o.branch : undefined,
    targetUrl: typeof o.targetUrl === "string" ? o.targetUrl : undefined,
    prNumber: numField(o.prNumber),
    sessionId: typeof o.sessionId === "string" ? o.sessionId : undefined,
    durationMs: numField(o.durationMs),
    passed: numField(o.passed),
    failed: numField(o.failed),
    failedSteps,
    runKind: typeof o.runKind === "string" ? o.runKind : undefined,
  };
}

const AGENT_RUN_STEPS: StepId[] = ["architect", "scripter", "watchdog", "healer"];

const STEP_TITLE: Record<StepId, string> = {
  code_push: "Code push",
  architect: "The Architect",
  scripter: "The Scripter",
  tests_gate: "Tests gate",
  courier: "Courier",
  watchdog: "The Watchdog",
  healer: "The Healer",
  confidence_gate: "Confidence gate",
  ship: "Ship",
  block: "Hold / escalate",
};

function stepHuman(step: StepId): string {
  return STEP_TITLE[step] ?? step;
}

function buildBlocks(input: {
  step: StepId;
  status: StepStatus;
  message?: string;
  path?: "courier" | "watchdog";
  branch?: "success" | "failure";
  outcome?: "ship" | "block";
  slack?: PipelineSlackMeta;
}): { text: string; blocks: Block[] } | null {
  const { step, status, message, path, branch, outcome, slack: slackRaw } = input;
  const m = mergeMeta(slackRaw);
  const label = appLabel();

  if (status === "idle") return null;

  if (step === "code_push" && status === "running") {
    const text = `${label} — Pipeline started for ${m.repo}`;
    const blocks: Block[] = [
      {
        type: "header",
        text: { type: "plain_text", text: `:rocket: ${label} — Pipeline Started`, emoji: true },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${escSlackMrkdwn(m.runKind)}* for *${escSlackMrkdwn(m.repo)}* (branch: *${escSlackMrkdwn(m.branch)}*).`,
        },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Repository*\n${escSlackMrkdwn(m.repo)}` },
          { type: "mrkdwn", text: `*Branch*\n${escSlackMrkdwn(m.branch)}` },
          {
            type: "mrkdwn",
            text: `*Target URL*\n${escSlackMrkdwn(m.targetUrl)}${m.prNumber != null ? ` (PR #${m.prNumber})` : ""}`,
          },
          { type: "mrkdwn", text: `*Started At*\n${escSlackMrkdwn(startedAtLabel())}` },
        ],
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `${escSlackMrkdwn(label)} is coordinating agents and test execution (e.g. Playwright MCP).`,
          },
        ],
      },
    ];
    if (message?.trim()) {
      blocks.splice(2, 0, {
        type: "section",
        text: { type: "mrkdwn", text: escSlackMrkdwn(message.trim()) },
      });
    }
    return { text, blocks };
  }

  if (AGENT_RUN_STEPS.includes(step) && status === "running") {
    const text = `${label} — ${stepHuman(step)} active`;
    const blocks: Block[] = [
      {
        type: "header",
        text: { type: "plain_text", text: `:gear: ${label} — Agent Running`, emoji: true },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${escSlackMrkdwn(stepHuman(step))}* is now running.\n${message?.trim() ? escSlackMrkdwn(message.trim()) : "_No message supplied._"}`,
        },
      },
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: `*Repo:* ${escSlackMrkdwn(m.repo)} · *Branch:* ${escSlackMrkdwn(m.branch)}` },
        ],
      },
    ];
    return { text, blocks };
  }

  if (status === "failed") {
    const text = `${label} — Step failed: ${stepHuman(step)}`;
    const blocks: Block[] = [
      {
        type: "header",
        text: { type: "plain_text", text: `:x: ${label} — Step Failed`, emoji: true },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Step:* ${escSlackMrkdwn(stepHuman(step))}\n${message?.trim() ? escSlackMrkdwn(message.trim()) : "_No error details._"}`,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `*Repo:* ${escSlackMrkdwn(m.repo)} · *Session:* ${m.sessionId ? escSlackMrkdwn(m.sessionId) : "—"}`,
          },
        ],
      },
    ];
    return { text, blocks };
  }

  if (step === "tests_gate" && status === "completed") {
    const failedPath = path === "watchdog" || branch === "failure";
    if (failedPath) {
      const failed = m.failed ?? m.failedSteps?.length ?? 0;
      const passed = m.passed ?? 0;
      const total = failed + passed;
      const text = `${label} — Tests failed (${failed} failed)`;
      const failedLines =
        m.failedSteps?.length ?
          m.failedSteps
            .map((f) => `• *Step:* ${escSlackMrkdwn(f.step)}\n   *Error:* ${escSlackMrkdwn(f.error)}`)
            .join("\n")
        : message?.trim() ?
          escSlackMrkdwn(message.trim())
        : "_No step breakdown supplied — include `slack.failedSteps` on the webhook._";

      const blocks: Block[] = [
        {
          type: "header",
          text: { type: "plain_text", text: `:x: ${label} — Tests Failed`, emoji: true },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text:
              total > 0 ?
                `*${failed}/${total}* checks failed on *${escSlackMrkdwn(m.targetUrl)}* — immediate attention required!`
              : `Tests did not pass on *${escSlackMrkdwn(m.targetUrl)}* — immediate attention required!`,
          },
        },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: `*Repo*\n${escSlackMrkdwn(m.repo)}` },
            { type: "mrkdwn", text: `*Failed*\n:x: ${failed}` },
            { type: "mrkdwn", text: `*Passed*\n:white_check_mark: ${passed}` },
            {
              type: "mrkdwn",
              text: `*Duration*\n${m.durationMs != null ? `${(m.durationMs / 1000).toFixed(1)}s` : "—"}`,
            },
          ],
        },
        {
          type: "section",
          text: { type: "mrkdwn", text: `*Failed steps:*\n${failedLines}` },
        },
      ];
      if (m.sessionId) {
        blocks.push({
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `*Session* \`${escSlackMrkdwn(m.sessionId)}\` · Failed at ${escSlackMrkdwn(startedAtLabel())}`,
            },
          ],
        });
      }
      return { text, blocks };
    }

    const text = `${label} — Tests passed`;
    const blocks: Block[] = [
      {
        type: "header",
        text: { type: "plain_text", text: `:white_check_mark: ${label} — Tests Passed`, emoji: true },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `All required checks passed for *${escSlackMrkdwn(m.targetUrl)}*.\n${message?.trim() ? escSlackMrkdwn(message.trim()) : "_Proceeding to next stage._"}`,
        },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Repo*\n${escSlackMrkdwn(m.repo)}` },
          { type: "mrkdwn", text: `*Branch*\n${escSlackMrkdwn(m.branch)}` },
        ],
      },
    ];
    return { text, blocks };
  }

  if (step === "ship" && status === "completed") {
    const text = `${label} — Shipped / merged`;
    const blocks: Block[] = [
      {
        type: "header",
        text: { type: "plain_text", text: `:rocket: ${label} — Pipeline Complete`, emoji: true },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: message?.trim() ?
            escSlackMrkdwn(message.trim())
          : `Release signal sent for *${escSlackMrkdwn(m.repo)}* (branch *${escSlackMrkdwn(m.branch)}*).`,
        },
      },
    ];
    return { text, blocks };
  }

  if (step === "block" && status === "completed") {
    const text = `${label} — Escalation / hold`;
    const blocks: Block[] = [
      {
        type: "header",
        text: { type: "plain_text", text: `:warning: ${label} — Pipeline Blocked`, emoji: true },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: message?.trim() ?
            escSlackMrkdwn(message.trim())
          : `Confidence or policy gate requires human action for *${escSlackMrkdwn(m.repo)}*.`,
        },
      },
    ];
    return { text, blocks };
  }

  if (step === "courier" && status === "completed") {
    const text = `${label} — Courier delivered`;
    const blocks: Block[] = [
      {
        type: "header",
        text: { type: "plain_text", text: `:incoming_envelope: ${label} — Notifications Sent`, emoji: true },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: message?.trim() ? escSlackMrkdwn(message.trim()) : "Slack / status updates dispatched.",
        },
      },
    ];
    return { text, blocks };
  }

  if (step === "confidence_gate" && status === "completed") {
    if (outcome === "block" || branch === "failure") {
      const text = `${label} — Low confidence`;
      return {
        text,
        blocks: [
          {
            type: "header",
            text: { type: "plain_text", text: `:rotating_light: ${label} — Confidence Too Low`, emoji: true },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: message?.trim() ? escSlackMrkdwn(message.trim()) : "Threshold not met — review required.",
            },
          },
        ],
      };
    }
    if (outcome === "ship" || branch === "success") {
      const text = `${label} — Confidence OK`;
      return {
        text,
        blocks: [
          {
            type: "header",
            text: { type: "plain_text", text: `:white_check_mark: ${label} — Confidence Gate Passed`, emoji: true },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: message?.trim() ? escSlackMrkdwn(message.trim()) : "Above threshold — continue.",
            },
          },
        ],
      };
    }
  }

  return null;
}

export function notifyPipelineSlack(input: {
  step: StepId;
  status: StepStatus;
  message?: string;
  path?: "courier" | "watchdog";
  branch?: "success" | "failure";
  outcome?: "ship" | "block";
  slack?: PipelineSlackMeta;
}): void {
  const url = pipelineWebhookUrl();
  if (!url) return;

  const payload = buildBlocks(input);
  if (!payload) return;

  void fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(postPayload(payload.text, payload.blocks)),
    signal: AbortSignal.timeout(8000),
  }).catch(() => {});
}
