"use client";

import { useState } from "react";
import TopBar from "@/components/TopBar";

interface PR {
  number: number;
  title: string;
  author: string;
  headRef: string;
  baseRef: string;
  url: string;
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
      { sha: "a4f2e1c", msg: "fix: null-check in auth middleware", author: "jdoe",  time: "8m ago"  },
      { sha: "88d09b5", msg: "feat: add RAG context injection",    author: "kpatel", time: "2h ago"  },
      { sha: "f3c11da", msg: "chore: bump langchain to 0.2.4",    author: "jdoe",   time: "6h ago"  },
    ],
  },
  {
    icon: "account_tree",
    name: "frontend-mission-control",
    branch: "staging",
    synced: "45m ago",
    language: "Next.js",
    prs: 1,
    issues: 4,
    coverage: 78,
    active: false,
    commits: [
      { sha: "c91ae3f", msg: "ui: refactor dashboard grid layout",  author: "mgupta", time: "1h ago" },
      { sha: "7e2ab01", msg: "fix: sidebar active state hydration", author: "jdoe",   time: "4h ago" },
      { sha: "39bcd7e", msg: "chore: update Tailwind config",       author: "mgupta", time: "1d ago" },
    ],
  },
  {
    icon: "schema",
    name: "data-pipeline-v4",
    branch: "production",
    synced: "12s ago",
    language: "Python",
    prs: 0,
    issues: 2,
    coverage: 85,
    active: true,
    commits: [
      { sha: "52f8c4d", msg: "perf: vectorise healer embeddings", author: "kpatel", time: "30m ago" },
      { sha: "d1b07c3", msg: "fix: MongoDB vector index timeout",  author: "jdoe",   time: "3h ago" },
      { sha: "ae44081", msg: "feat: store fix from API endpoint",  author: "kpatel", time: "8h ago" },
    ],
  },
];

export default function ReposPage() {
  const [owner, setOwner] = useState("harshkg23");
  const [repoName, setRepoName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [livePRs, setLivePRs] = useState<PR[] | null>(null);

  async function fetchPRs() {
    if (!owner || !repoName) return;
    setLoading(true);
    setError("");
    setLivePRs(null);
    try {
      const res = await fetch(`/api/agent/pull-requests?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repoName)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to fetch PRs");
      setLivePRs(data.pullRequests ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <TopBar activeLabel="Repositories" />

      <main className="p-8 space-y-8 max-w-[1600px]">

        {/* Page header */}
        <header className="flex justify-between items-end">
          <div className="space-y-1">
            <h1 className="text-4xl font-headline font-bold tracking-tight text-fg-1">Repositories</h1>
            <p className="font-mono text-[11px] text-fg-4 uppercase tracking-widest">
              Watched repos · commit stream · coverage
            </p>
          </div>
        </header>

        {/* Live PR Fetcher */}
        <section className="glass-panel rounded-xl p-6 border-l-2 border-accent">
          <h2 className="font-headline text-base font-bold text-fg-1 mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-accent" style={{ fontSize: "18px" }}>rebase</span>
            Live PR Scanner
          </h2>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1">
              <label className="font-mono text-[9px] text-fg-4 uppercase tracking-widest">GitHub Owner</label>
              <input
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                placeholder="owner"
                className="bg-[var(--bg-elevated)] border border-[var(--bd)] rounded-lg px-3 py-2 font-mono text-xs text-fg-1 placeholder:text-fg-4 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 w-44"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-mono text-[9px] text-fg-4 uppercase tracking-widest">Repository</label>
              <input
                value={repoName}
                onChange={(e) => setRepoName(e.target.value)}
                placeholder="repo-name"
                className="bg-[var(--bg-elevated)] border border-[var(--bd)] rounded-lg px-3 py-2 font-mono text-xs text-fg-1 placeholder:text-fg-4 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 w-52"
              />
            </div>
            <button
              onClick={fetchPRs}
              disabled={loading || !owner || !repoName}
              className="kinetic-gradient text-white font-mono font-bold text-[11px] uppercase tracking-widest px-5 py-2.5 rounded-lg hover:opacity-90 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading
                ? <><span className="material-symbols-outlined animate-spin" style={{ fontSize: "14px" }}>progress_activity</span> Loading…</>
                : <><span className="material-symbols-outlined" style={{ fontSize: "14px" }}>search</span> Scan PRs</>
              }
            </button>
          </div>

          {error && (
            <div className="mt-4 flex items-center gap-2 bg-neg/10 border border-neg/30 px-3 py-2 rounded-lg">
              <span className="material-symbols-outlined text-neg" style={{ fontSize: "14px" }}>error</span>
              <p className="font-mono text-[11px] text-neg">{error}</p>
            </div>
          )}

          {livePRs !== null && (
            <div className="mt-5">
              {livePRs.length === 0 ? (
                <p className="font-mono text-[11px] text-fg-3">No open PRs found for <span className="text-accent">{owner}/{repoName}</span>.</p>
              ) : (
                <div className="space-y-2">
                  <p className="font-mono text-[10px] text-fg-4 mb-3">{livePRs.length} open PR{livePRs.length !== 1 ? "s" : ""} in <span className="text-accent">{owner}/{repoName}</span></p>
                  {livePRs.map((pr) => (
                    <a
                      key={pr.number}
                      href={pr.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-3 p-3 bg-[var(--bg-elevated)] hover:bg-[var(--bg-card)] border border-[var(--bd)] rounded-lg transition-colors group"
                    >
                      <span className="font-mono text-[10px] text-fg-4 shrink-0 tabular-nums">#{pr.number}</span>
                      <span className="flex-1 font-mono text-[11px] text-fg-2 truncate group-hover:text-fg-1">{pr.title}</span>
                      <span className="font-mono text-[9px] text-fg-4 shrink-0">@{pr.author}</span>
                      <span className="font-mono text-[9px] text-data shrink-0">{pr.headRef} → {pr.baseRef}</span>
                      <span className="material-symbols-outlined text-fg-4 shrink-0 group-hover:text-accent transition-colors" style={{ fontSize: "14px" }}>arrow_outward</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Repo cards */}
        <div className="space-y-6">
          {repos.map((repo) => (
            <div key={repo.name} className={`glass-panel rounded-xl overflow-hidden border-l-2 ${repo.active ? "border-accent" : "border-[var(--bd-2)]"}`}>

              {/* Repo header */}
              <div className="px-6 py-5 border-b border-[var(--bd)] flex flex-wrap gap-4 items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-[var(--bg-elevated)] flex items-center justify-center">
                    <span className="material-symbols-outlined text-fg-3" style={{ fontSize: "20px" }}>{repo.icon}</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono text-sm font-bold text-fg-1">{repo.name}</span>
                      {repo.active && <div className="w-1.5 h-1.5 rounded-full bg-pos animate-pulse" />}
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

                {/* Stats chips */}
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 bg-[var(--bg-elevated)] px-3 py-1.5 rounded-lg font-mono text-[10px] text-fg-3">
                    <span className="material-symbols-outlined text-accent" style={{ fontSize: "13px" }}>rebase</span>
                    {repo.prs} PRs
                  </div>
                  <div className="flex items-center gap-1.5 bg-[var(--bg-elevated)] px-3 py-1.5 rounded-lg font-mono text-[10px] text-fg-3">
                    <span className="material-symbols-outlined text-warn" style={{ fontSize: "13px" }}>bug_report</span>
                    {repo.issues} Issues
                  </div>
                  <div className="flex items-center gap-1.5 bg-[var(--bg-elevated)] px-3 py-1.5 rounded-lg font-mono text-[10px] text-fg-3">
                    <span className="material-symbols-outlined text-pos" style={{ fontSize: "13px" }}>verified</span>
                    {repo.coverage}% Coverage
                  </div>
                  <button className="ml-2 px-4 py-1.5 bg-[var(--accent-soft)] hover:bg-accent hover:text-white border border-accent/20 text-accent rounded-lg font-mono text-[10px] uppercase tracking-widest transition-all">
                    Analyse PRs
                  </button>
                </div>
              </div>

              {/* Coverage bar */}
              <div className="px-6 py-2 bg-[var(--bg-elevated)] border-b border-[var(--bd)] flex items-center gap-3">
                <span className="font-mono text-[9px] text-fg-4 uppercase tracking-widest shrink-0">Coverage</span>
                <div className="flex-1 bg-[var(--bg-card)] h-1 rounded-full overflow-hidden">
                  <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${repo.coverage}%` }} />
                </div>
                <span className="font-mono text-[9px] text-accent">{repo.coverage}%</span>
              </div>

              {/* Recent commits */}
              <div className="divide-y divide-[var(--bd)]">
                {repo.commits.map((c) => (
                  <div key={c.sha} className="flex items-center gap-4 px-6 py-3 hover:bg-[var(--bg-elevated)] transition-colors">
                    <span className="font-mono text-[10px] text-data shrink-0 tabular-nums">{c.sha}</span>
                    <span className="material-symbols-outlined text-fg-3 shrink-0" style={{ fontSize: "14px" }}>commit</span>
                    <span className="flex-1 font-mono text-[11px] text-fg-2 truncate">{c.msg}</span>
                    <span className="font-mono text-[9px] text-fg-4 shrink-0">@{c.author}</span>
                    <span className="font-mono text-[9px] text-fg-4 shrink-0 w-16 text-right">{c.time}</span>
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
