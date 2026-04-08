"use client";

import { useMemo, useState } from "react";

interface PullRequestSummary {
  number: number;
  title: string;
  state: string;
  url: string;
  author: string;
  headRef: string;
  baseRef: string;
}

interface ReviewFinding {
  file: string;
  line: number;
  category: string;
  severity: "low" | "medium" | "high";
  title: string;
  explanation: string;
  suggestion: string;
}

interface PipelineResponse {
  status: string;
  repo: string;
  pr: { number: number; title: string; url: string };
  review: {
    riskScore: number;
    summary: string;
    findings: ReviewFinding[];
    features: {
      tone: string;
      estimatedMonthlyCostImpact: string;
      falsePositiveLearningHint: string;
    };
  };
  nextActions: string[];
}

type DashboardTab =
  | "overview"
  | "pipeline"
  | "pullRequests"
  | "findings"
  | "integrations"
  | "settings";

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<DashboardTab>("overview");
  const [owner, setOwner] = useState("harshkg23");
  const [repo, setRepo] = useState("");
  const [mode, setMode] = useState<"npx" | "docker">("npx");
  const [slackChannel, setSlackChannel] = useState("#sentinelqa");
  const [tone, setTone] = useState("Direct and concise");
  const [loadingPrs, setLoadingPrs] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [pullRequests, setPullRequests] = useState<PullRequestSummary[]>([]);
  const [selectedPr, setSelectedPr] = useState<number | null>(null);
  const [result, setResult] = useState<PipelineResponse | null>(null);

  const selected = useMemo(
    () => pullRequests.find((pr) => pr.number === selectedPr) ?? null,
    [pullRequests, selectedPr],
  );

  async function loadPullRequests() {
    if (!owner || !repo) return;
    setLoadingPrs(true);
    setError("");
    setResult(null);
    try {
      const query = new URLSearchParams({ owner, repo, mode });
      const res = await fetch(`/api/agent/pull-requests?${query.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to load pull requests.");
      const prs = (data.pullRequests ?? []) as PullRequestSummary[];
      setPullRequests(prs);
      setSelectedPr(prs[0]?.number ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load pull requests.");
    } finally {
      setLoadingPrs(false);
    }
  }

  async function runReview() {
    if (!selected) return;
    setRunning(true);
    setError("");
    try {
      const res = await fetch("/api/agent/pipeline", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          owner,
          repo,
          selectedPr: {
            number: selected.number,
            title: selected.title,
            url: selected.url,
          },
          slackChannel,
          tone,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to run review pipeline.");
      setResult(data as PipelineResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pipeline failed.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#070b1a] text-slate-100">
      <div className="flex min-h-screen">
        <aside className="w-72 shrink-0 border-r border-white/10 bg-[#050914] p-4">
          <div className="rounded-2xl border border-cyan-400/30 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-200">Luminus</p>
            <h1 className="mt-2 text-xl font-black">Review Co-Pilot</h1>
            <p className="mt-1 text-xs text-slate-400">Sentinel-style control panel</p>
          </div>

          <div className="mt-4 space-y-1">
            {[
              { id: "overview", label: "Overview" },
              { id: "pipeline", label: "Pipeline Runner" },
              { id: "pullRequests", label: "PR Inbox" },
              { id: "findings", label: "Findings" },
              { id: "integrations", label: "Integrations" },
              { id: "settings", label: "Settings" },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as DashboardTab)}
                className={`w-full rounded-xl px-3 py-2 text-left text-sm ${
                  activeTab === item.id
                    ? "bg-cyan-400/15 text-cyan-200 border border-cyan-400/40"
                    : "text-slate-300 hover:bg-white/5"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-3">
            <p className="text-xs font-semibold text-cyan-200">Integration Health</p>
            <ul className="mt-2 space-y-2 text-xs text-slate-300">
              <li>GitHub MCP: {repo ? "Configured" : "Waiting for repo"}</li>
              <li>Slack Webhook: Configured via `.env`</li>
              <li>Review Engine: Active (mock reviewer)</li>
            </ul>
          </div>
        </aside>

        <section className="flex-1 px-6 py-8">
          {error ? <p className="mb-4 rounded-lg bg-red-500/20 p-3 text-sm text-red-200">{error}</p> : null}

          {activeTab === "overview" ? (
            <div className="space-y-4">
              <header className="rounded-2xl border border-cyan-400/30 bg-white/5 p-6">
                <h2 className="text-3xl font-black">Overview</h2>
                <p className="mt-2 text-sm text-slate-300">
                  Centralized feature hub for PR analysis, AI findings, and integration monitoring.
                </p>
              </header>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs text-slate-400">Open PRs</p>
                  <p className="text-2xl font-black">{pullRequests.length}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs text-slate-400">Selected PR</p>
                  <p className="text-2xl font-black">{selectedPr ? `#${selectedPr}` : "None"}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs text-slate-400">Risk Score</p>
                  <p className="text-2xl font-black">{result ? `${result.review.riskScore}/100` : "—"}</p>
                </div>
              </div>
            </div>
          ) : null}

          {activeTab === "pipeline" ? (
            <div className="space-y-4">
              <h2 className="text-2xl font-black">Pipeline Runner</h2>
              <section className="grid gap-4 md:grid-cols-2">
                <input
                  className="rounded-xl border border-white/20 bg-black/20 p-3 text-sm"
                  placeholder="GitHub owner"
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                />
                <input
                  className="rounded-xl border border-white/20 bg-black/20 p-3 text-sm"
                  placeholder="Repository name"
                  value={repo}
                  onChange={(e) => setRepo(e.target.value)}
                />
                <select
                  className="rounded-xl border border-white/20 bg-black/20 p-3 text-sm"
                  value={mode}
                  onChange={(e) => setMode(e.target.value as "npx" | "docker")}
                >
                  <option value="npx">GitHub MCP via npx</option>
                  <option value="docker">GitHub MCP via docker</option>
                </select>
                <input
                  className="rounded-xl border border-white/20 bg-black/20 p-3 text-sm"
                  placeholder="#alerts"
                  value={slackChannel}
                  onChange={(e) => setSlackChannel(e.target.value)}
                />
                <input
                  className="rounded-xl border border-white/20 bg-black/20 p-3 text-sm md:col-span-2"
                  placeholder="Review tone (Strict Mentor, Encouraging, Direct...)"
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                />
              </section>
              <div className="flex gap-3">
                <button
                  onClick={loadPullRequests}
                  disabled={loadingPrs || !owner || !repo}
                  className="rounded-full bg-cyan-400 px-5 py-2 text-sm font-bold text-slate-900 disabled:opacity-50"
                >
                  {loadingPrs ? "Loading PRs..." : "Load Open PRs"}
                </button>
                <button
                  onClick={runReview}
                  disabled={running || !selected}
                  className="rounded-full border border-cyan-300/40 px-5 py-2 text-sm font-semibold disabled:opacity-50"
                >
                  {running ? "Running Review..." : "Run AI Review Pipeline"}
                </button>
              </div>

              <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-cyan-200">Loaded PRs</h3>
                  <span className="text-xs text-slate-400">{pullRequests.length} open PRs</span>
                </div>
                <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
                  {pullRequests.length === 0 ? (
                    <p className="text-sm text-slate-400">Click "Load Open PRs" to render PR list.</p>
                  ) : (
                    pullRequests.slice(0, 20).map((pr) => (
                      <button
                        key={pr.number}
                        onClick={() => setSelectedPr(pr.number)}
                        className={`w-full rounded-xl border px-4 py-3 text-left ${
                          selectedPr === pr.number
                            ? "border-cyan-400/70 bg-cyan-400/10"
                            : "border-white/10 bg-black/10"
                        }`}
                      >
                        <p className="text-xs text-slate-400">
                          PR #{pr.number} - {pr.author} - {pr.headRef} → {pr.baseRef}
                        </p>
                        <p className="text-sm font-semibold">{pr.title}</p>
                      </button>
                    ))
                  )}
                </div>
              </section>

              {selected ? (
                <section className="rounded-2xl border border-cyan-400/30 bg-cyan-400/10 p-4">
                  <p className="text-xs text-cyan-200">Selected PR</p>
                  <h3 className="text-sm font-bold">
                    #{selected.number} - {selected.title}
                  </h3>
                  <a
                    href={selected.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block text-xs text-cyan-300 underline"
                  >
                    Open on GitHub
                  </a>
                </section>
              ) : null}

              {result ? (
                <section className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-5">
                  <h3 className="text-lg font-bold">Latest Review Result</h3>
                  <p className="mt-1 text-sm">{result.review.summary}</p>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <div className="rounded-xl border border-white/15 bg-black/20 p-3">
                      <p className="text-xs text-slate-400">Risk Score</p>
                      <p className="text-2xl font-black">{result.review.riskScore}/100</p>
                    </div>
                    <div className="rounded-xl border border-white/15 bg-black/20 p-3">
                      <p className="text-xs text-slate-400">Findings</p>
                      <p className="text-2xl font-black">{result.review.findings.length}</p>
                    </div>
                    <div className="rounded-xl border border-white/15 bg-black/20 p-3">
                      <p className="text-xs text-slate-400">Tone</p>
                      <p className="text-sm font-semibold">{result.review.features.tone}</p>
                    </div>
                  </div>
                </section>
              ) : null}
            </div>
          ) : null}

          {activeTab === "pullRequests" ? (
            <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <h2 className="text-lg font-bold text-cyan-200">PR Inbox</h2>
              <div className="mt-3 space-y-2">
                {pullRequests.length === 0 ? (
                  <p className="text-sm text-slate-400">No PRs loaded yet.</p>
                ) : (
                  pullRequests.map((pr) => (
                    <button
                      key={pr.number}
                      onClick={() => setSelectedPr(pr.number)}
                      className={`w-full rounded-xl border px-4 py-3 text-left ${
                        selectedPr === pr.number
                          ? "border-cyan-400/70 bg-cyan-400/10"
                          : "border-white/10 bg-black/10"
                      }`}
                    >
                      <p className="text-xs text-slate-400">
                        PR #{pr.number} - {pr.author} - {pr.headRef} → {pr.baseRef}
                      </p>
                      <p className="text-sm font-semibold">{pr.title}</p>
                    </button>
                  ))
                )}
              </div>
            </section>
          ) : null}

          {activeTab === "findings" ? (
            <section className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-5">
              <h2 className="text-xl font-bold">Findings</h2>
              {!result ? (
                <p className="mt-2 text-sm text-slate-300">Run pipeline first to view findings.</p>
              ) : (
                <>
                  <p className="mt-1 text-sm">{result.review.summary}</p>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <div className="rounded-xl border border-white/15 bg-black/20 p-3">
                      <p className="text-xs text-slate-400">Risk Score</p>
                      <p className="text-2xl font-black">{result.review.riskScore}/100</p>
                    </div>
                    <div className="rounded-xl border border-white/15 bg-black/20 p-3">
                      <p className="text-xs text-slate-400">Findings</p>
                      <p className="text-2xl font-black">{result.review.findings.length}</p>
                    </div>
                    <div className="rounded-xl border border-white/15 bg-black/20 p-3">
                      <p className="text-xs text-slate-400">Tone</p>
                      <p className="text-sm font-semibold">{result.review.features.tone}</p>
                    </div>
                  </div>
                  <div className="mt-4 space-y-3">
                    {result.review.findings.map((f, index) => (
                      <article key={`${f.file}-${index}`} className="rounded-xl border border-white/15 bg-black/20 p-4">
                        <p className="text-xs text-slate-400">
                          {f.category} - {f.severity.toUpperCase()} - {f.file}:{f.line}
                        </p>
                        <h3 className="text-sm font-bold">{f.title}</h3>
                        <p className="mt-1 text-sm text-slate-300">{f.explanation}</p>
                        <p className="mt-2 text-sm text-cyan-200">Suggestion: {f.suggestion}</p>
                      </article>
                    ))}
                  </div>
                </>
              )}
            </section>
          ) : null}

          {activeTab === "integrations" ? (
            <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <h2 className="text-xl font-bold">Integrated Features and Integrations</h2>
              <ul className="mt-3 space-y-2 text-sm text-slate-300">
                <li>GitHub MCP integration for pull-request fetch and context.</li>
                <li>Slack integration for review completion summary.</li>
                <li>AI review pipeline endpoint for asynchronous PR analysis.</li>
                <li>Tone adjustment setting for review personality.</li>
                <li>Cost impact and false-positive learning hints in response payload.</li>
              </ul>
            </section>
          ) : null}

          {activeTab === "settings" ? (
            <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <h2 className="text-xl font-bold">Settings</h2>
              <p className="mt-2 text-sm text-slate-300">
                All API keys are loaded from `.env` only. Keep `GITHUB_PERSONAL_ACCESS_TOKEN` and
                `SLACK_WEBHOOK_URL` updated for this dashboard.
              </p>
            </section>
          ) : null}
        </section>
      </div>
    </main>
  );
}
