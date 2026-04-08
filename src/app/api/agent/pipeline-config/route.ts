import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Defaults for the Repos / dashboard pipeline UI (server env only — no secret values). */
export async function GET() {
  const target_url =
    process.env.TOLLGATE_TARGET_URL?.trim() ||
    process.env.SENTINELQA_TARGET_URL?.trim() ||
    process.env.TARGET_URL?.trim() ||
    "";
  const slack_channel =
    process.env.PIPELINE_SLACK_DEFAULT_CHANNEL?.trim() ||
    process.env.SLACK_NOTIFICATION_CHANNEL?.trim() ||
    "#new-channel";
  return NextResponse.json({ target_url, slack_channel });
}
