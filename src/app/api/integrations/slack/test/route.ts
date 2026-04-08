import { NextResponse } from "next/server";
import { escSlackMrkdwn } from "@/lib/integrations/slack";

export const dynamic = "force-dynamic";

/**
 * POST — sends a one-off Block Kit message to verify SLACK_PIPELINE_WEBHOOK_URL / SLACK_WEBHOOK_URL.
 * (Client secret and signing secret are not used for outbound webhook posts.)
 */
export async function POST() {
  const url =
    process.env.SLACK_PIPELINE_WEBHOOK_URL?.trim() || process.env.SLACK_WEBHOOK_URL?.trim();
  if (!url) {
    return NextResponse.json(
      {
        error:
          "No webhook URL configured. Set SLACK_PIPELINE_WEBHOOK_URL (or SLACK_WEBHOOK_URL) to your Incoming Webhook URL from Slack.",
      },
      { status: 400 },
    );
  }

  const label = process.env.PIPELINE_SLACK_APP_LABEL?.trim() || "TollGate";
  const repo = process.env.PIPELINE_SLACK_DEFAULT_REPO?.trim() || "owner/repo";

  const payload = {
    text: `${label} — Slack webhook test from Luminus`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: `:white_check_mark: ${label} — Webhook OK`, emoji: true },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `Slack is receiving messages from your app. *Repository:* ${escSlackMrkdwn(repo)}`,
        },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: "*Check*\nIncoming Webhook" },
          { type: "mrkdwn", text: `*Sent*\n${escSlackMrkdwn(new Date().toLocaleString())}` },
        ],
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: "Pipeline notifications use the same URL when agents call `/api/agent/pipeline/webhook`.",
          },
        ],
      },
    ],
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const detail = (await res.text()).slice(0, 400);
      return NextResponse.json(
        { error: "Slack returned an error", status: res.status, detail },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true, message: "Check your Slack channel for the test message." });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Request failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
