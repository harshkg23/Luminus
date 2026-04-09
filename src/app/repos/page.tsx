"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import TopBar from "@/components/TopBar";
import type { PipelineSnapshot } from "@/lib/pipeline/types";
import PipelineFlowDiagram from "@/components/pipeline/PipelineFlowDiagram";
import LivePipelineTerminal from "@/components/pipeline/LivePipelineTerminal";

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

/** PR picker: how many rows per page (all PRs are loaded; this only paginates the list UI). */
const PR_LIST_PAGE_SIZE = 15;

const emptySnapshot = (): PipelineSnapshot => ({
  steps: {
    code_push: "idle",
    architect: "idle",
    scripter: "idle",
    tests_gate: "idle",
    courier: "idle",
    watchdog: "idle",
    healer: "idle",
    confidence_gate: "idle",
    ship: "idle",
    block: "idle",
  },
  afterTests: null,
  afterConfidence: null,
  logs: [],
  updatedAt: 0,
});

export default function ReposPage() {
  const [owner, setOwner] = useState("harshkg23");
  const [repoName, setRepoName] = useState("sample-dashboard-app");
  const [targetUrl, setTargetUrl] = useState(
    () =>
      process.env.NEXT_PUBLIC_TOLLGATE_TARGET_URL ??
      process.env.NEXT_PUBLIC_SENTINELQA_TARGET_URL ??
      "http://localhost:3000",
  );
  const [slackChannel, setSlackChannel] = useState("#new-channel");

  // SSE Pipeline state
  const [snapshot, setSnapshot] = useState<PipelineSnapshot>(emptySnapshot);
  const [sseOk, setSseOk] = useState(false);

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

  useEffect(() => {
    const es = new EventSource("/api/agent/pipeline/events");
    es.onmessage = (ev) => {
      try {
        setSnapshot(JSON.parse(ev.data) as PipelineSnapshot);
        setSseOk(true);
      } catch {
        /* ignore */
      }
    };
    es.onerror = () => setSseOk(false);
    return () => es.close();
  }, []);

  const [mode, setMode] = useState<"npx" | "docker">("npx");
  const [tone, setTone] = useState("Direct and concise");

  const [loadingPrs, setLoadingPrs] = useState(false);
  const [runningPipeline, setRunningPipeline] = useState(false);
  const [error, setError] = useState("");
  const [pullRequests, setPullRequests] = useState<PullRequestSummary[]>([]);
  /** Client-side page over loaded PRs (API returns all open PRs). */
  const [prListPage, setPrListPage] = useState(1);
  const [selectedPr, setSelectedPr] = useState<number | null>(null);
  const [result, setResult] = useState<TollGatePipelineResult | null>(null);

  const selected = useMemo(
    () => pullRequests.find((pr) => pr.number === selectedPr) ?? null,
    [pullRequests, selectedPr],
  );

  const prListTotalPages = Math.max(1, Math.ceil(pullRequests.length / PR_LIST_PAGE_SIZE));
  const pagedPullRequests = useMemo(() => {
    const page = Math.min(prListPage, prListTotalPages);
    const start = (page - 1) * PR_LIST_PAGE_SIZE;
    return pullRequests.slice(start, start + PR_LIST_PAGE_SIZE);
  }, [pullRequests, prListPage, prListTotalPages]);

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
      setPrListPage(1);
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

  const simulate = useCallback(async () => {
    await fetch("/api/agent/pipeline/simulate", { method: "POST" });
  }, []);

  const resetPipeline = useCallback(async () => {
    await fetch("/api/agent/pipeline/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset" }),
    });
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-base)]">
      <TopBar activeLabel="Repositories" />

      <main className="flex-1 flex flex-col min-h-0 px-4 py-8 md:px-8 max-w-[1600px] mx-auto w-full space-y-8">
        <header className="flex justify-between items-end">
          <div className="space-y-1">
            <h1 className="text-4xl font-headline font-bold tracking-tight text-fg-1">Repositories</h1>
            <p className="font-mono text-[11px] text-fg-4 uppercase tracking-widest">
              Review pipeline runner
            </p>
          </div>
          
          <div className="flex items-center gap-3">
             <span
              className={`inline-flex items-center gap-1.5 font-mono text-[9px] px-2.5 py-1 rounded-full border ${
                sseOk
                  ? "border-pos/40 text-pos bg-pos/5"
                  : "border-[var(--bd)] text-fg-4 bg-[var(--bg-elevated)]"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${sseOk ? "bg-pos animate-pulse" : "bg-fg-4"}`}
              />
              {sseOk ? "Live" : "Connecting…"}
            </span>

            <button
              type="button"
              onClick={simulate}
              className="bg-[var(--bg-elevated)] border border-[var(--bd)] text-fg-2 font-mono font-bold text-[11px] uppercase tracking-wider py-1.5 px-3 rounded-lg flex items-center gap-2 hover:border-[var(--bd-2)] active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>
                play_arrow
              </span>
              Simulate
            </button>

            <button
              type="button"
              onClick={resetPipeline}
              className="bg-[var(--bg-elevated)] border border-[var(--bd)] text-fg-2 font-mono font-bold text-[11px] uppercase tracking-wider py-1.5 px-3 rounded-lg flex items-center gap-2 hover:border-[var(--bd-2)] active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>
                refresh
              </span>
              Reset
            </button>
          </div>
        </header>

        {/* Pipeline + PR loader */}
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
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-mono text-[10px] text-fg-4 uppercase tracking-widest">
                  Select PR ({pullRequests.length} open — page {Math.min(prListPage, prListTotalPages)}/
                  {prListTotalPages})
                </p>
                {prListTotalPages > 1 ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={prListPage <= 1}
                      onClick={() => setPrListPage((p) => Math.max(1, p - 1))}
                      className="font-mono text-[10px] uppercase tracking-wider px-2 py-1 rounded border border-[var(--bd)] bg-[var(--bg-elevated)] text-fg-2 hover:border-[var(--bd-2)] disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Prev
                    </button>
                    <button
                      type="button"
                      disabled={prListPage >= prListTotalPages}
                      onClick={() => setPrListPage((p) => Math.min(prListTotalPages, p + 1))}
                      className="font-mono text-[10px] uppercase tracking-wider px-2 py-1 rounded border border-[var(--bd)] bg-[var(--bg-elevated)] text-fg-2 hover:border-[var(--bd-2)] disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                ) : null}
              </div>
              <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {pagedPullRequests.map((pr) => (
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

        {/* 60 / 40 split — flow | terminal */}
        <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-5 flex-1 min-h-[500px]">
          {/* ── Flow Diagram (60%) ── */}
          <section className="flex flex-col min-h-[min(60vh,560px)] lg:min-h-0 min-w-0 rounded-2xl border border-[var(--glass-bd)] overflow-hidden" style={{ background: "#08090f" }}>
            <div className="shrink-0 px-4 py-2.5 border-b flex items-center gap-2" style={{ borderColor: "rgba(255,255,255,0.06)", background: "#0d0e1a" }}>
              <span className="material-symbols-outlined text-accent" style={{ fontSize: "15px" }}>
                account_tree
              </span>
              <span className="font-mono text-[10px] uppercase tracking-widest font-bold" style={{ color: "rgba(255,255,255,0.8)" }}>
                Live Agent Flow
              </span>
              <span className="ml-auto font-mono text-[9px] font-medium" style={{ color: "rgba(255,255,255,0.5)" }}>
                Multi-agent orchestration
              </span>
            </div>
            <div className="flex-1 min-h-0 w-full p-2">
              <PipelineFlowDiagram snapshot={snapshot} />
            </div>
          </section>

          {/* ── Terminal (40%) ── */}
          <section className="flex flex-col min-h-[min(48vh,440px)] lg:min-h-0 min-w-0">
            <LivePipelineTerminal snapshot={snapshot} className="flex-1 min-h-0" />
          </section>
        </div>
      </main>
    </div>
  );
}
