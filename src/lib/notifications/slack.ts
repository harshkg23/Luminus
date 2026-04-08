import "server-only";

// ============================================================================
// TollGate — Slack Notification Service
//
// Sends professional Slack notifications via Incoming Webhook.
// Used by the agent pipeline to report:
//   - When the pipeline starts (manual trigger)
//   - When the agent is triggered (new commits detected)
//   - When tests start running
//   - When tests pass or fail (with failure details)
//   - When a pipeline error occurs
//
// Setup:
//   • SLACK_WEBHOOK_URL or SLACK_PIPELINE_WEBHOOK_URL — Incoming Webhook URL.
//     The webhook must be created for the channel you want (e.g. #new-channel);
//     Slack usually ignores JSON "channel" overrides for standard webhooks.
//   • Optional: SLACK_NOTIFICATION_CHANNEL — default channel hint (#new-channel or C… ID)
//     for payloads that support it / future chat.postMessage.
// ============================================================================

function resolveSlackWebhookUrl(explicit?: string): string | undefined {
  const u =
    explicit?.trim() ||
    process.env.SLACK_WEBHOOK_URL?.trim() ||
    process.env.SLACK_PIPELINE_WEBHOOK_URL?.trim();
  return u || undefined;
}

function resolveSlackChannel(explicit?: string): string | undefined {
  const c =
    explicit?.trim() ||
    process.env.SLACK_NOTIFICATION_CHANNEL?.trim() ||
    process.env.PIPELINE_SLACK_DEFAULT_CHANNEL?.trim() ||
    process.env.SLACK_CHANNEL?.trim() ||
    process.env.SLACK_DEFAULT_CHANNEL?.trim();
  if (!c) return undefined;
  return c.startsWith("#") || c.startsWith("C") ? c : `#${c}`;
}

export interface SlackNotifyOptions {
  webhookUrl?: string;
  channel?: string;
}

// ── Block Kit helpers ──────────────────────────────────────────────────────

type Block = Record<string, unknown>;

function header(text: string): Block {
  return { type: "header", text: { type: "plain_text", text, emoji: true } };
}

function section(markdown: string): Block {
  return { type: "section", text: { type: "mrkdwn", text: markdown } };
}

function divider(): Block {
  return { type: "divider" };
}

function fields(...items: string[]): Block {
  return {
    type: "section",
    fields: items.map((t) => ({ type: "mrkdwn", text: t })),
  };
}

function context(text: string): Block {
  return {
    type: "context",
    elements: [{ type: "mrkdwn", text }],
  };
}

// ── mrkdwn sanitiser ────────────────────────────────────────────────────────
// Prevents Slack mention injection (<!here>, <!channel>) and broken
// formatting caused by &, <, > or backticks in user-controlled strings.

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/`/g, "\u02CB"); // replace backtick with modifier letter grave (visually identical)
}

// ── Core sender ─────────────────────────────────────────────────────────────
// send() is intentionally non-blocking for callers: routes fire it with
// `void sendSlack(...)` so the HTTP response is never delayed. Internally
// a 5-second AbortSignal bounds the network call so it cannot hang.

async function send(blocks: Block[], fallbackText: string, opts?: SlackNotifyOptions): Promise<void> {
  const webhookUrl = resolveSlackWebhookUrl(opts?.webhookUrl);

  if (!webhookUrl) {
    console.warn(
      "[Slack] No webhook URL — set SLACK_WEBHOOK_URL or SLACK_PIPELINE_WEBHOOK_URL",
    );
    return;
  }

  const normalizedChannel = resolveSlackChannel(opts?.channel);
  const payload: Record<string, unknown> = { text: fallbackText, blocks };

  if (normalizedChannel) {
    payload.channel = normalizedChannel;
  }

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5_000), // never block the pipeline for more than 5 s
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[Slack] Webhook failed (${res.status}): ${body}`);
    } else {
      console.log(`[Slack] ✅ Notification sent: ${fallbackText}`);
    }
  } catch (err) {
    console.error("[Slack] Failed to send notification:", err);
  }
}

function ts(): string {
  return `<!date^${Math.floor(Date.now() / 1000)}^{date_short} at {time}|${new Date().toISOString()}>`;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Notify when the pipeline is manually started (no commit context available).
 * Use this instead of notifyAgentTriggered when commitCount is unknown.
 */
export async function notifyPipelineStarted(
  owner: string,
  repo: string,
  branch: string,
  targetUrl: string,
  opts?: SlackNotifyOptions
): Promise<void> {
  const repoLink = `<https://github.com/${owner}/${repo}/tree/${branch}|${esc(owner)}/${esc(repo)}>`;

  const blocks: Block[] = [
    header("🚀 TollGate — Pipeline Started"),
    section(`Manual pipeline run triggered for *${repoLink}* (branch: \`${esc(branch)}\`).`),
    divider(),
    fields(
      `*Repository*\n${esc(owner)}/${esc(repo)}`,
      `*Branch*\n\`${esc(branch)}\``,
      `*Target URL*\n${esc(targetUrl)}`,
      `*Started At*\n${ts()}`
    ),
    divider(),
    context("TollGate is generating a test plan and will execute tests via Playwright MCP."),
  ];

  await send(blocks, `🚀 Pipeline started for ${esc(owner)}/${esc(repo)} (${esc(branch)}) → ${esc(targetUrl)}`, opts);
}

/**
 * Notify when the agent is triggered by new commits in a watched repo.
 */
export async function notifyAgentTriggered(
  owner: string,
  repo: string,
  branch: string,
  commitCount: number,
  commits: Array<{ sha: string; message: string; author: string }>,
  opts?: SlackNotifyOptions
): Promise<void> {
  const repoLink = `<https://github.com/${owner}/${repo}/tree/${branch}|${esc(owner)}/${esc(repo)}>`;
  const commitLines = commits
    .slice(0, 5)
    .map((c) => `• \`${c.sha.slice(0, 7)}\` ${esc(c.message.split("\n")[0]).slice(0, 80)} — _${esc(c.author)}_`)
    .join("\n");

  const blocks: Block[] = [
    header("🔍 TollGate — Agent Triggered"),
    section(`New commits detected on *${repoLink}* (branch: \`${esc(branch)}\`). Running automated QA pipeline.`),
    divider(),
    fields(
      `*Repository*\n${esc(owner)}/${esc(repo)}`,
      `*Branch*\n\`${esc(branch)}\``,
      `*New Commits*\n${commitCount}`,
      `*Triggered At*\n${ts()}`
    ),
    ...(commitLines ? [section(`*Recent Commits:*\n${commitLines}`)] : []),
    divider(),
    context("TollGate is now generating a test plan and executing tests via Playwright MCP."),
  ];

  await send(blocks, `🔍 Agent triggered on ${esc(owner)}/${esc(repo)} — ${commitCount} new commit(s)`, opts);
}

/**
 * Notify when the test execution starts.
 */
export async function notifyTestsStarted(
  owner: string,
  repo: string,
  targetUrl: string,
  stepCount: number,
  sessionId: string,
  opts?: SlackNotifyOptions
): Promise<void> {
  const blocks: Block[] = [
    header("⚡ TollGate — Tests Running"),
    section(`Executing *${stepCount} test step(s)* against \`${esc(targetUrl)}\``),
    divider(),
    fields(
      `*Repo*\n${esc(owner)}/${esc(repo)}`,
      `*Session*\n\`${esc(sessionId)}\``,
      `*Target URL*\n${esc(targetUrl)}`,
      `*Started*\n${ts()}`
    ),
    divider(),
    context("Playwright MCP is controlling the browser. Results coming shortly."),
  ];

  await send(blocks, `⚡ Running ${stepCount} tests on ${esc(targetUrl)} for ${esc(owner)}/${esc(repo)}`, opts);
}

/**
 * Notify when all tests pass.
 */
export async function notifyTestsPassed(
  owner: string,
  repo: string,
  targetUrl: string,
  total: number,
  durationMs: number,
  sessionId: string,
  opts?: SlackNotifyOptions
): Promise<void> {
  const blocks: Block[] = [
    header("✅ TollGate — All Tests Passed"),
    section(`*${total}/${total}* tests passed on \`${esc(targetUrl)}\` :tada:`),
    divider(),
    fields(
      `*Repo*\n${esc(owner)}/${esc(repo)}`,
      `*Tests*\n${total} passed`,
      `*Duration*\n${(durationMs / 1000).toFixed(1)}s`,
      `*Session*\n\`${esc(sessionId)}\``
    ),
    context(`Completed at ${ts()}`),
  ];

  await send(blocks, `✅ All ${total} tests passed for ${esc(owner)}/${esc(repo)}`, opts);
}

/**
 * Notify when one or more tests fail.
 */
export async function notifyTestsFailed(
  owner: string,
  repo: string,
  targetUrl: string,
  passed: number,
  failed: number,
  total: number,
  durationMs: number,
  sessionId: string,
  failedSteps: Array<{ step: string; error?: string }>,
  opts?: SlackNotifyOptions
): Promise<void> {
  const failureLines = failedSteps
    .slice(0, 6)
    .map((s) => `• *Step:* ${esc(s.step)}\n  *Error:* ${esc((s.error ?? "Unknown error").slice(0, 120))}`)
    .join("\n\n");

  const blocks: Block[] = [
    header("❌ TollGate — Tests Failed"),
    section(`*${failed}/${total}* tests failed on \`${esc(targetUrl)}\` — immediate attention required!`),
    divider(),
    fields(
      `*Repo*\n${esc(owner)}/${esc(repo)}`,
      `*Failed*\n:x: ${failed}`,
      `*Passed*\n:white_check_mark: ${passed}`,
      `*Duration*\n${(durationMs / 1000).toFixed(1)}s`
    ),
    ...(failureLines
      ? [divider(), section(`*Failed Steps:*\n\n${failureLines}`)]
      : []),
    divider(),
    fields(
      `*Session*\n\`${esc(sessionId)}\``,
      `*Target URL*\n${esc(targetUrl)}`
    ),
    context(`Failed at ${ts()} — Check session \`${esc(sessionId)}\` for full details.`),
  ];

  await send(
    blocks,
    `❌ ${failed}/${total} tests failed on ${esc(owner)}/${esc(repo)} — ${esc(targetUrl)}`,
    opts
  );
}

/**
 * Notify when the pipeline throws an unexpected error.
 */
export async function notifyPipelineError(
  owner: string,
  repo: string,
  stage: string,
  errorMessage: string,
  opts?: SlackNotifyOptions
): Promise<void> {
  const blocks: Block[] = [
    header("🚨 TollGate — Pipeline Error"),
    section(`An error occurred during the *${esc(stage)}* stage for *${owner}/${repo}*.`),
    divider(),
    // Use a plain indented block — avoids backtick injection breaking the code fence
    section(`*Error:*\n>${esc(errorMessage).slice(0, 500).replace(/\n/g, "\n>")}`),
    divider(),
    fields(
      `*Repo*\n${esc(owner)}/${esc(repo)}`,
      `*Stage*\n${esc(stage)}`,
      `*Time*\n${ts()}`
    ),
    context("Check server logs for the full stack trace."),
  ];

  await send(
    blocks,
    `🚨 Pipeline error in ${esc(stage)} for ${esc(owner)}/${esc(repo)}: ${esc(errorMessage).slice(0, 100)}`,
    opts
  );
}
