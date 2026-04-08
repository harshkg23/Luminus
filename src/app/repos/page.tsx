"use client";

import { useEffect, useMemo, useState } from "react";
import TopBar from "@/components/TopBar";

interface PullRequestSummary {
  number: number;
  title: string;
  state: string;
  url: string;
  author: string;
  headRef: string;
  baseRef: string;
}

/** Response from POST /api/agent/pipeline (TollGate orchestrator). */
interface TollGatePipelineResult {
  pipeline: string;
  repo: string;
  session_id: string;
  test_plan: string;
  results: {
    total: number;
    passed: number;
    failed: number;
    duration_ms: number;
    details: unknown[];
  };
  courier?: { type: string; url?: string; number?: number };
  pr?: { url?: string; number?: number; files?: string[] };
}

const repos = [
  {
    icon: "folder_special",
    name: "tollgate-api-core",
    branch: "main",
    synced: "2m ago",
    language: "TypeScript",
    prs: 3,
    issues: 1,
    coverage: 92,
    active: true,
    commits: [
      { sha: "a4f2e1c", msg: "fix: null-check in auth middleware", author: "jdoe", time: "8m ago" },
      { sha: "88d09b5", msg: "feat: add RAG context injection", author: "kpatel", time: "2h ago" },
      { sha: "f3c11da", msg: "chore: bump langchain to 0.2.4", author: "jdoe", time: "6h ago" },
    ],
  },
  {
    icon: "account_tree",
    name: "frontend-mission-control",
    branch: "staging",
    language: "Next.js",
    synced: "45m ago",
    prs: 1,
    issues: 4,
    coverage: 78,
    active: false,
    commits: [
      { sha: "c91ae3f", msg: "ui: refactor dashboard grid layout", author: "mgupta", time: "1h ago" },
      { sha: "7e2ab01", msg: "fix: sidebar active state hydration", author: "jdoe", time: "4h ago" },
      { sha: "39bcd7e", msg: "chore: update Tailwind config", author: "mgupta", time: "1d ago" },
    ],
  },
  {
    icon: "schema",
    name: "data-pipeline-v4",
    branch: "production",
    language: "Python",
    synced: "12s ago",
    prs: 0,
    issues: 2,
    coverage: 85,
    active: true,
    commits: [
      { sha: "52f8c4d", msg: "perf: vectorise healer embeddings", author: "kpatel", time: "30m ago" },
      { sha: "d1b07c3", msg: "fix: MongoDB vector index timeout", author: "jdoe", time: "3h ago" },
      { sha: "ae44081", msg: "feat: store fix from API endpoint", author: "kpatel", time: "8h ago" },
    ],
  },
];

export default function ReposPage() {
  const [owner, setOwner] = useState("harshkg23");
  const [repoName, setRepoName] = useState("sample-dashboard-app");
  const [targetUrl, setTargetUrl] = useState(
    () =>
      process.env.NEXT_PUBLIC_TOLLGATE_TARGET_URL ??
      process.env.NEXT_PUBLIC_SENTINELQA_TARGET_URL ??
      "",
  );
  const [slackChannel, setSlackChannel] = useState("#new-channel");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/agent/pipeline-config");
        const data = (await res.json()) as {
          target_url?: string;
          slack_channel?: string;
        };
        const u = data.target_url?.trim();
        const slack = data.slack_channel?.trim();
        if (!cancelled && u) {
          setTargetUrl((prev) => (prev.trim() ? prev : u));
        }
        if (!cancelled && slack) {
          setSlackChannel(slack);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const [mode, setMode] = useState<"npx" | "docker">("npx");
  const [tone, setTone] = useState("Direct and concise");

  const [loadingPrs, setLoadingPrs] = useState(false);
  const [runningPipeline, setRunningPipeline] = useState(false);
  const [error, setError] = useState("");
  const [pullRequests, setPullRequests] = useState<PullRequestSummary[]>([]);
  const [selectedPr, setSelectedPr] = useState<number | null>(null);
  const [result, setResult] = useState<TollGatePipelineResult | null>(null);

  const selected = useMemo(
    () => pullRequests.find((pr) => pr.number === selectedPr) ?? null,
    [pullRequests, selectedPr],
  );

  async function loadPullRequestsFor(o: string, r: string) {
    if (!o.trim() || !r.trim()) return;
    setLoadingPrs(true);
    setError("");
    setResult(null);
    try {
      const query = new URLSearchParams({ owner: o.trim(), repo: r.trim(), mode });
      const res = await fetch(`/api/agent/pull-requests?${query.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to load pull requests.");
      const prs = (data.pullRequests ?? []) as PullRequestSummary[];
      setPullRequests(prs);
      setSelectedPr(prs[0]?.number ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
      setPullRequests([]);
      setSelectedPr(null);
    } finally {
      setLoadingPrs(false);
    }
  }

  function loadPullRequests() {
    return void loadPullRequestsFor(owner, repoName);
  }

  async function runPipeline() {
    if (!selected || !owner || !repoName) return;
    if (!targetUrl.trim()) {
      setError("Set target URL (deployed app to test, e.g. Vercel preview).");
      return;
    }
    setRunningPipeline(true);
    setError("");
    try {
      const res = await fetch("/api/agent/pipeline", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          owner,
          repo: repoName,
          target_url: targetUrl.trim(),
          github_mcp_mode: mode,
          selected_pr: {
            number: selected.number,
            title: selected.title,
            url: selected.url,
            headRef: selected.headRef,
            baseRef: selected.baseRef,
          },
          slack_channel: slackChannel || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to run review pipeline.");
      setResult(data as TollGatePipelineResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pipeline failed.");
    } finally {
      setRunningPipeline(false);
    }
  }

  function useRepoFromCard(name: string) {
    setRepoName(name);
    setPullRequests([]);
    setSelectedPr(null);
    setResult(null);
    setError("");
    void loadPullRequestsFor(owner, name);
  }

  return (
    <>
      <TopBar activeLabel="Repositories" />

      <main className="p-8 space-y-8 max-w-[1600px]">
        <header className="flex justify-between items-end">
          <div className="space-y-1">
            <h1 className="text-4xl font-headline font-bold tracking-tight text-fg-1">Repositories</h1>
            <p className="font-mono text-[11px] text-fg-4 uppercase tracking-widest">
              Watched repos · AI review pipeline · same flow as dashboard
            </p>
          </div>
        </header>

        {/* Pipeline + PR loader (matches /dashboard Pipeline Runner) */}
        <section className="glass-panel rounded-xl p-6 border-l-2 border-accent space-y-5">
          <h2 className="font-headline text-base font-bold text-fg-1 flex items-center gap-2">
            <span className="material-symbols-outlined text-accent" style={{ fontSize: "18px" }}>
              hub
            </span>
            Review pipeline
          </h2>
          <p className="font-mono text-[10px] text-fg-4 -mt-2 uppercase tracking-widest">
            Load open PRs → select one → run TollGate pipeline → Healer may open a fix PR
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="flex flex-col gap-1">
              <label className="font-mono text-[9px] text-fg-4 uppercase tracking-widest">GitHub owner</label>
              <input
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                placeholder="owner"
                className="bg-[var(--bg-elevated)] border border-[var(--bd)] rounded-lg px-3 py-2 font-mono text-xs text-fg-1 placeholder:text-fg-4 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-mono text-[9px] text-fg-4 uppercase tracking-widest">Repository</label>
              <input
                value={repoName}
                onChange={(e) => setRepoName(e.target.value)}
                placeholder="repo-name"
                className="bg-[var(--bg-elevated)] border border-[var(--bd)] rounded-lg px-3 py-2 font-mono text-xs text-fg-1 placeholder:text-fg-4 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-mono text-[9px] text-fg-4 uppercase tracking-widest">GitHub MCP</label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as "npx" | "docker")}
                className="bg-[var(--bg-elevated)] border border-[var(--bd)] rounded-lg px-3 py-2 font-mono text-xs text-fg-1 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20"
              >
                <option value="npx">npx</option>
                <option value="docker">docker</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-mono text-[9px] text-fg-4 uppercase tracking-widest">Slack channel</label>
              <input
                value={slackChannel}
                onChange={(e) => setSlackChannel(e.target.value)}
                placeholder="#alerts"
                className="bg-[var(--bg-elevated)] border border-[var(--bd)] rounded-lg px-3 py-2 font-mono text-xs text-fg-1 placeholder:text-fg-4 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20"
              />
            </div>
            <div className="flex flex-col gap-1 sm:col-span-2">
              <label className="font-mono text-[9px] text-fg-4 uppercase tracking-widest">
                Target URL (app under test)
              </label>
              <input
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                placeholder="https://your-app.vercel.app"
                className="bg-[var(--bg-elevated)] border border-[var(--bd)] rounded-lg px-3 py-2 font-mono text-xs text-fg-1 placeholder:text-fg-4 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20"
              />
            </div>
            <div className="flex flex-col gap-1 sm:col-span-2">
              <label className="font-mono text-[9px] text-fg-4 uppercase tracking-widest">Review tone</label>
              <input
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                placeholder="Strict Mentor, Encouraging, Direct…"
                className="bg-[var(--bg-elevated)] border border-[var(--bd)] rounded-lg px-3 py-2 font-mono text-xs text-fg-1 placeholder:text-fg-4 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-3 items-center">
            <button
              type="button"
              onClick={loadPullRequests}
              disabled={loadingPrs || !owner || !repoName}
              className="kinetic-gradient text-white font-mono font-bold text-[11px] uppercase tracking-widest px-5 py-2.5 rounded-lg hover:opacity-90 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loadingPrs ? (
                <>
                  <span className="material-symbols-outlined animate-spin" style={{ fontSize: "14px" }}>
                    progress_activity
                  </span>
                  Loading PRs…
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>
                    search
                  </span>
                  Load open PRs
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => void runPipeline()}
              disabled={
                runningPipeline || !selected || !owner || !repoName || !targetUrl.trim()
              }
              className="border border-accent/40 bg-[var(--accent-soft)] text-accent font-mono font-bold text-[11px] uppercase tracking-widest px-5 py-2.5 rounded-lg hover:bg-accent hover:text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {runningPipeline ? (
                <>
                  <span className="material-symbols-outlined animate-spin" style={{ fontSize: "14px" }}>
                    progress_activity
                  </span>
                  Running pipeline…
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>
                    play_arrow
                  </span>
                  Start pipeline
                </>
              )}
            </button>
          </div>
          <p className="font-mono text-[9px] text-fg-4 -mt-1">
            Start pipeline needs a PR, owner, repo, and Target URL. If the button stays faded, fill
            Target URL or set{" "}
            <code className="text-fg-3">TOLLGATE_TARGET_URL</code> /{" "}
            <code className="text-fg-3">SENTINELQA_TARGET_URL</code> /{" "}
            <code className="text-fg-3">TARGET_URL</code> in <code className="text-fg-3">.env</code>{" "}
            (loaded via <code className="text-fg-3">/api/agent/pipeline-config</code>).
          </p>

          {error ? (
            <div className="flex items-center gap-2 bg-neg/10 border border-neg/30 px-3 py-2 rounded-lg">
              <span className="material-symbols-outlined text-neg" style={{ fontSize: "14px" }}>
                error
              </span>
              <p className="font-mono text-[11px] text-neg">{error}</p>
            </div>
          ) : null}

          {pullRequests.length > 0 ? (
            <div className="space-y-3">
              <p className="font-mono text-[10px] text-fg-4 uppercase tracking-widest">
                Select PR ({pullRequests.length} open)
              </p>
              <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {pullRequests.slice(0, 20).map((pr) => (
                  <button
                    key={pr.number}
                    type="button"
                    onClick={() => setSelectedPr(pr.number)}
                    className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-colors ${
                      selectedPr === pr.number
                        ? "border-accent bg-[var(--accent-soft)]"
                        : "border-[var(--bd)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-card)]"
                    }`}
                  >
                    <span className="font-mono text-[10px] text-fg-4 tabular-nums shrink-0 mt-0.5">
                      #{pr.number}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-[10px] text-fg-4">
                        {pr.author} · {pr.headRef} → {pr.baseRef}
                      </p>
                      <p className="font-mono text-[11px] text-fg-1 truncate">{pr.title}</p>
                    </div>
                    <a
                      href={pr.url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="shrink-0 text-fg-4 hover:text-accent"
                      title="Open on GitHub"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
                        arrow_outward
                      </span>
                    </a>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {selected ? (
            <div className="rounded-lg border border-accent/30 bg-[var(--accent-soft)] px-4 py-3">
              <p className="font-mono text-[9px] text-accent uppercase tracking-widest">Selected</p>
              <p className="font-mono text-sm font-bold text-fg-1 mt-1">
                #{selected.number} — {selected.title}
              </p>
              <a
                href={selected.url}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[10px] text-accent hover:underline mt-1 inline-block"
              >
                Open on GitHub
              </a>
            </div>
          ) : null}

          {result ? (
            <div className="rounded-xl border border-pos/30 bg-pos/10 p-5 space-y-4">
              <h3 className="font-headline text-sm font-bold text-fg-1">Pipeline result</h3>
              <p className="font-mono text-[10px] text-fg-3">
                Session <span className="text-data">{result.session_id}</span> · {result.repo}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-[var(--bg-elevated)] border border-[var(--bd)] rounded-lg p-3">
                  <p className="font-mono text-[9px] text-fg-4 uppercase tracking-widest">Passed</p>
                  <p className="font-headline text-2xl font-bold text-pos">
                    {result.results.passed}/{result.results.total}
                  </p>
                </div>
                <div className="bg-[var(--bg-elevated)] border border-[var(--bd)] rounded-lg p-3">
                  <p className="font-mono text-[9px] text-fg-4 uppercase tracking-widest">Failed</p>
                  <p className="font-headline text-2xl font-bold text-fg-1">
                    {result.results.failed}
                  </p>
                </div>
                <div className="bg-[var(--bg-elevated)] border border-[var(--bd)] rounded-lg p-3">
                  <p className="font-mono text-[9px] text-fg-4 uppercase tracking-widest">Duration</p>
                  <p className="font-mono text-[11px] text-fg-1 mt-1">
                    {(result.results.duration_ms / 1000).toFixed(1)}s
                  </p>
                </div>
              </div>
              {result.pr?.url ? (
                <div className="rounded-lg border border-accent/40 bg-[var(--accent-soft)] px-4 py-3">
                  <p className="font-mono text-[9px] text-accent uppercase tracking-widest">
                    Fix / tests PR raised
                  </p>
                  <a
                    href={result.pr.url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-sm font-bold text-fg-1 hover:text-accent mt-1 inline-block break-all"
                  >
                    PR #{result.pr.number} — open on GitHub
                  </a>
                  {result.pr.files?.length ? (
                    <p className="font-mono text-[10px] text-fg-3 mt-2">
                      Files: {result.pr.files.slice(0, 8).join(", ")}
                      {result.pr.files.length > 8 ? "…" : ""}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {result.courier?.url ? (
                <div className="rounded-lg border border-warn/40 bg-warn/10 px-4 py-3">
                  <p className="font-mono text-[9px] text-warn uppercase tracking-widest">
                    Courier · {result.courier.type}
                  </p>
                  <a
                    href={result.courier.url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-xs text-fg-1 hover:underline mt-1 inline-block break-all"
                  >
                    #{result.courier.number} — {result.courier.url}
                  </a>
                </div>
              ) : null}
              <details className="bg-[var(--bg-elevated)] border border-[var(--bd)] rounded-lg p-3">
                <summary className="font-mono text-[10px] text-fg-3 cursor-pointer">
                  Generated test plan (markdown)
                </summary>
                <pre className="mt-2 font-mono text-[9px] text-fg-2 whitespace-pre-wrap max-h-64 overflow-y-auto">
                  {result.test_plan}
                </pre>
              </details>
            </div>
          ) : null}
        </section>

        {/* Repo cards */}
        <div className="space-y-6">
          {repos.map((repo) => (
            <div
              key={repo.name}
              className={`glass-panel rounded-xl overflow-hidden border-l-2 ${
                repo.active ? "border-accent" : "border-[var(--bd-2)]"
              }`}
            >
              <div className="px-6 py-5 border-b border-[var(--bd)] flex flex-wrap gap-4 items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-[var(--bg-elevated)] flex items-center justify-center">
                    <span className="material-symbols-outlined text-fg-3" style={{ fontSize: "20px" }}>
                      {repo.icon}
                    </span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono text-sm font-bold text-fg-1">{repo.name}</span>
                      {repo.active ? <div className="w-1.5 h-1.5 rounded-full bg-pos animate-pulse" /> : null}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 font-mono text-[9px] text-fg-4 uppercase tracking-widest">
                      <span>Branch: {repo.branch}</span>
                      <span className="w-px h-3 bg-[var(--bd)]" />
                      <span>Synced {repo.synced}</span>
                      <span className="w-px h-3 bg-[var(--bd)]" />
                      <span>{repo.language}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 bg-[var(--bg-elevated)] px-3 py-1.5 rounded-lg font-mono text-[10px] text-fg-3">
                    <span className="material-symbols-outlined text-accent" style={{ fontSize: "13px" }}>
                      rebase
                    </span>
                    {repo.prs} PRs
                  </div>
                  <div className="flex items-center gap-1.5 bg-[var(--bg-elevated)] px-3 py-1.5 rounded-lg font-mono text-[10px] text-fg-3">
                    <span className="material-symbols-outlined text-warn" style={{ fontSize: "13px" }}>
                      bug_report
                    </span>
                    {repo.issues} Issues
                  </div>
                  <div className="flex items-center gap-1.5 bg-[var(--bg-elevated)] px-3 py-1.5 rounded-lg font-mono text-[10px] text-fg-3">
                    <span className="material-symbols-outlined text-pos" style={{ fontSize: "13px" }}>
                      verified
                    </span>
                    {repo.coverage}% Coverage
                  </div>
                  <button
                    type="button"
                    onClick={() => useRepoFromCard(repo.name)}
                    className="ml-2 px-4 py-1.5 bg-[var(--accent-soft)] hover:bg-accent hover:text-white border border-accent/20 text-accent rounded-lg font-mono text-[10px] uppercase tracking-widest transition-all"
                  >
                    Use in pipeline
                  </button>
                </div>
              </div>

              <div className="px-6 py-2 bg-[var(--bg-elevated)] border-b border-[var(--bd)] flex items-center gap-3">
                <span className="font-mono text-[9px] text-fg-4 uppercase tracking-widest shrink-0">
                  Coverage
                </span>
                <div className="flex-1 bg-[var(--bg-card)] h-1 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent rounded-full transition-all"
                    style={{ width: `${repo.coverage}%` }}
                  />
                </div>
                <span className="font-mono text-[9px] text-accent">{repo.coverage}%</span>
              </div>

              <div className="divide-y divide-[var(--bd)]">
                {repo.commits.map((c) => (
                  <div
                    key={c.sha}
                    className="flex items-center gap-4 px-6 py-3 hover:bg-[var(--bg-elevated)] transition-colors"
                  >
                    <span className="font-mono text-[10px] text-data shrink-0 tabular-nums">{c.sha}</span>
                    <span className="material-symbols-outlined text-fg-3 shrink-0" style={{ fontSize: "14px" }}>
                      commit
                    </span>
                    <span className="flex-1 font-mono text-[11px] text-fg-2 truncate">{c.msg}</span>
                    <span className="font-mono text-[9px] text-fg-4 shrink-0">@{c.author}</span>
                    <span className="font-mono text-[9px] text-fg-4 shrink-0 w-16 text-right">
                      {c.time}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </main>
    </>
  );
}
