import TopBar from "@/components/TopBar";

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
      { sha: "a4f2e1c", msg: "fix: null-check in auth middleware", author: "jdoe",   time: "8m ago"  },
      { sha: "88d09b5", msg: "feat: add RAG context injection",   author: "kpatel",  time: "2h ago"  },
      { sha: "f3c11da", msg: "chore: bump langchain to 0.2.4",   author: "jdoe",    time: "6h ago"  },
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
      { sha: "c91ae3f", msg: "ui: refactor dashboard grid layout", author: "mgupta", time: "1h ago"  },
      { sha: "7e2ab01", msg: "fix: sidebar active state hydration", author: "jdoe",  time: "4h ago"  },
      { sha: "39bcd7e", msg: "chore: update Tailwind config",       author: "mgupta",time: "1d ago"  },
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
      { sha: "52f8c4d", msg: "perf: vectorise healer embeddings",  author: "kpatel",  time: "30m ago" },
      { sha: "d1b07c3", msg: "fix: MongoDB vector index timeout",   author: "jdoe",   time: "3h ago"  },
      { sha: "ae44081", msg: "feat: store fix from API endpoint",   author: "kpatel", time: "8h ago"  },
    ],
  },
];

export default function ReposPage() {
  return (
    <>
      <TopBar activeLabel="Repositories" />

      <main className="p-8 space-y-8 max-w-[1600px]">

        {/* Page header */}
        <header className="flex justify-between items-end">
          <div className="space-y-1">
            <h1 className="text-4xl font-headline font-bold tracking-tight text-on-surface">Repositories</h1>
            <p className="font-mono text-[11px] text-[#b9caca]/40 uppercase tracking-widest">
              Watched repos · commit stream · coverage
            </p>
          </div>
          <button className="font-mono text-[10px] text-[#00dce5] border border-[#00dce5]/30 px-4 py-2 rounded hover:bg-[#00dce5]/10 transition-all uppercase tracking-widest flex items-center gap-2">
            <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>add</span>
            Watch Repo
          </button>
        </header>

        {/* Repo cards */}
        <div className="space-y-6">
          {repos.map((repo) => (
            <div key={repo.name} className={`glass-panel rounded-xl overflow-hidden border-l-2 ${repo.active ? "border-[#00f5ff]" : "border-white/10"}`}>

              {/* Repo header */}
              <div className="px-6 py-5 border-b border-white/5 flex flex-wrap gap-4 items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center">
                    <span className="material-symbols-outlined text-[#b9caca]/40" style={{ fontSize: "20px" }}>{repo.icon}</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono text-sm font-bold text-primary">{repo.name}</span>
                      {repo.active && <div className="pulse-indicator" />}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 font-mono text-[9px] text-[#b9caca]/30 uppercase tracking-widest">
                      <span>Branch: {repo.branch}</span>
                      <span className="w-px h-3 bg-white/10" />
                      <span>Synced {repo.synced}</span>
                      <span className="w-px h-3 bg-white/10" />
                      <span>{repo.language}</span>
                    </div>
                  </div>
                </div>

                {/* Stats chips */}
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 bg-white/5 px-3 py-1.5 rounded font-mono text-[10px] text-[#b9caca]/50">
                    <span className="material-symbols-outlined text-[#00dce5]" style={{ fontSize: "13px" }}>rebase</span>
                    {repo.prs} PRs
                  </div>
                  <div className="flex items-center gap-1.5 bg-white/5 px-3 py-1.5 rounded font-mono text-[10px] text-[#b9caca]/50">
                    <span className="material-symbols-outlined text-yellow-400" style={{ fontSize: "13px" }}>bug_report</span>
                    {repo.issues} Issues
                  </div>
                  <div className="flex items-center gap-1.5 bg-white/5 px-3 py-1.5 rounded font-mono text-[10px] text-[#b9caca]/50">
                    <span className="material-symbols-outlined text-green-400" style={{ fontSize: "13px" }}>verified</span>
                    {repo.coverage}% Coverage
                  </div>
                  <button className="ml-2 px-4 py-1.5 bg-[#00f5ff]/10 hover:bg-[#00f5ff]/20 border border-[#00f5ff]/20 text-[#00dce5] rounded font-mono text-[10px] uppercase tracking-widest transition-all">
                    Analyse PRs
                  </button>
                </div>
              </div>

              {/* Coverage bar */}
              <div className="px-6 py-2 bg-white/[0.02] border-b border-white/5 flex items-center gap-3">
                <span className="font-mono text-[9px] text-[#b9caca]/20 uppercase tracking-widest shrink-0">Coverage</span>
                <div className="flex-1 bg-white/5 h-1 rounded-full overflow-hidden">
                  <div className="h-full bg-[#00dce5] rounded-full" style={{ width: `${repo.coverage}%` }} />
                </div>
                <span className="font-mono text-[9px] text-[#00dce5]">{repo.coverage}%</span>
              </div>

              {/* Recent commits */}
              <div className="divide-y divide-white/[0.03]">
                {repo.commits.map((c) => (
                  <div key={c.sha} className="flex items-center gap-4 px-6 py-3 hover:bg-white/3 transition-colors">
                    <span className="font-mono text-[10px] text-[#00dce5]/60 shrink-0 tabular-nums">{c.sha}</span>
                    <span className="material-symbols-outlined text-[#b9caca]/20 shrink-0" style={{ fontSize: "14px" }}>commit</span>
                    <span className="flex-1 font-mono text-[11px] text-[#b9caca]/60 truncate">{c.msg}</span>
                    <span className="font-mono text-[9px] text-[#b9caca]/25 shrink-0">@{c.author}</span>
                    <span className="font-mono text-[9px] text-[#b9caca]/25 shrink-0 w-16 text-right">{c.time}</span>
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
