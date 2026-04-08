import "server-only";

/** Escape for Slack mrkdwn / plain_text that allows HTML entities in API payloads. */
export function escSlackMrkdwn(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function sendSlackReviewSummary(input: {
  owner: string;
  repo: string;
  prNumber: number;
  score: number;
  findings: number;
  highSeverity: number;
  channel?: string;
}): Promise<void> {
  const webhook = process.env.SLACK_WEBHOOK_URL;
  if (!webhook) return;

  const payload: Record<string, unknown> = {
    text: `Code review completed for ${input.owner}/${input.repo}#${input.prNumber}`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "Luminus Review Copilot", emoji: true },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Repository:* ${escSlackMrkdwn(input.owner)}/${escSlackMrkdwn(input.repo)}\n*PR:* #${input.prNumber}`,
        },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Risk Score*\n${input.score}/100` },
          { type: "mrkdwn", text: `*Findings*\n${input.findings}` },
          { type: "mrkdwn", text: `*High Severity*\n${input.highSeverity}` },
        ],
      },
    ],
  };

  if (input.channel?.trim()) {
    payload.channel = input.channel.trim();
  }

  await fetch(webhook, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(5000),
  }).catch(() => {});
}
