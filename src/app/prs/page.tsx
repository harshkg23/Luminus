import TopBar from "@/components/TopBar";

const prList = [
  { id: "#1284", title: "Critical Hotfix: Auth Middleware",  confidence: 88, sev: "neg",  active: true  },
  { id: "#1283", title: "feat: Add RAG memory retriever",    confidence: 74, sev: "warn", active: false },
  { id: "#1282", title: "refactor: Healer node pipeline",    confidence: 91, sev: "pos",  active: false },
  { id: "#1281", title: "fix: Playwright selector drift",    confidence: 62, sev: "fg-3", active: false },
];

const diffLines = [
  { num: "38", type: "ctx", content: "  async canActivate(context: ExecutionContext) {" },
  { num: "39", type: "ctx", content: "    const request = context.switchToHttp().getRequest();" },
  { num: "40", type: "del", content: "    const user = request.headers['x-user-id'];" },
  { num: "40", type: "add", content: "    const userId = request.headers['x-user-id'];" },
  { num: "41", type: "add", content: "    if (!userId) {" },
  { num: "42", type: "add", content: "      this.logger.error('Missing UserID in session header');" },
  { num: "43", type: "add", content: "      throw new UnauthorizedException('Security Breach: No User Context');" },
  { num: "44", type: "add", content: "    }" },
  { num: "45", type: "ctx", content: "    const session = await this.sessionService.validate(userId);" },
  { num: "46", type: "ctx", content: "    return session.isActive;" },
  { num: "47", type: "ctx", content: "  }" },
];

export default function PRsPage() {
  return (
    <>
      <TopBar activeLabel="PR Analysis" />

      <div className="p-7 max-w-7xl mx-auto space-y-7">

        {/* PR Strip */}
        <div className="flex gap-2 flex-wrap">
          {prList.map((pr) => (
            <button
              key={pr.id}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg border font-mono text-[11px] transition-all ${
                pr.active
                  ? "border-accent/40 bg-[var(--accent-soft)] text-fg-1"
                  : "border-[var(--bd)] bg-[var(--bg-card)] text-fg-3 hover:border-[var(--bd-2)] hover:text-fg-2"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full bg-${pr.sev}`} />
              <span className="text-fg-4">{pr.id}</span>
              <span className="truncate max-w-[180px]">{pr.title}</span>
              <span className="ml-auto text-accent">{pr.confidence}%</span>
            </button>
          ))}
        </div>

        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-5">
          <div className="space-y-2">
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-fg-3">
              <span className="w-4 h-px bg-accent" /> PR Analysis · #1284
            </div>
            <h1 className="font-headline text-4xl md:text-5xl font-bold tracking-tight text-fg-1">
              Critical Hotfix:{" "}
              <span className="text-accent">Auth Middleware</span>
            </h1>
          </div>

          {/* Confidence ring */}
          <div className="glass-panel p-4 px-6 rounded-xl flex items-center gap-4">
            <div className="relative w-12 h-12">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 48 48">
                <circle cx="24" cy="24" r="20" fill="transparent" stroke="currentColor" strokeWidth="4" className="text-[var(--bd-2)]" />
                <circle cx="24" cy="24" r="20" fill="transparent" stroke="currentColor" strokeWidth="4"
                  strokeDasharray="125.6" strokeDashoffset="15" className="text-accent" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center font-mono text-[10px] font-bold text-accent">88%</div>
            </div>
            <div>
              <div className="font-mono text-[9px] text-fg-3 uppercase tracking-wider mb-0.5">AI Confidence</div>
              <div className="font-headline text-base font-bold text-fg-1">High Reliability</div>
            </div>
          </div>
        </header>

        {/* Bento */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* Left */}
          <div className="lg:col-span-4 space-y-5">

            {/* RCA */}
            <section className="glass-panel p-6 rounded-xl border-l-2 border-neg relative overflow-hidden">
              <div className="absolute top-2 right-3 opacity-[0.04] pointer-events-none">
                <span className="material-symbols-outlined" style={{ fontSize: "80px" }}>diagnosis</span>
              </div>
              <h2 className="font-mono text-[10px] uppercase tracking-widest text-fg-3 mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-neg" style={{ fontVariationSettings: "'FILL' 1", fontSize: "15px" }}>warning</span>
                RCA Insight
              </h2>
              <div className="space-y-3">
                <div className="bg-[var(--bg-elevated)] p-4 rounded-lg">
                  <p className="font-headline font-semibold text-neg mb-1">Performance Critical</p>
                  <p className="font-mono text-[11px] text-fg-2 leading-relaxed">
                    Null check removed in line 42 — causes{" "}
                    <code className="bg-neg/10 text-neg px-1 rounded">TypeError</code>{" "}
                    during concurrent session validation.
                  </p>
                </div>
                <div className="font-mono text-[10px] text-fg-3 leading-relaxed">
                  Trigger: SessionRefreshEvent<br />Impact: 14% failure rate in staging
                </div>
              </div>
            </section>

            {/* Actions */}
            <section className="glass-panel p-6 rounded-xl space-y-4">
              <h3 className="font-headline font-bold text-base text-fg-1">Proposed Resolution</h3>
              <p className="font-mono text-[11px] text-fg-3 leading-relaxed">
                Patch generated via LLM-v4 Engine. Re-introduces validation guards with async safety.
              </p>
              <div className="flex flex-col gap-2.5 pt-1">
                <button className="kinetic-gradient text-white font-bold py-2.5 px-6 rounded-lg flex items-center justify-center gap-2 text-sm hover:opacity-90 transition-all">
                  <span className="material-symbols-outlined" style={{ fontSize: "17px" }}>verified</span>
                  Approve Merge
                </button>
                <button className="bg-[var(--bg-elevated)] hover:bg-[var(--accent-soft)] hover:text-accent border border-[var(--bd)] text-fg-2 font-mono text-xs uppercase tracking-wider py-2.5 px-6 rounded-lg flex items-center justify-center gap-2 transition-all">
                  <span className="material-symbols-outlined" style={{ fontSize: "15px" }}>visibility</span>
                  Review Diff
                </button>
              </div>
            </section>

            {/* RAG */}
            <section className="glass-panel p-5 rounded-xl border-l-2 border-vi">
              <h3 className="font-mono text-[9px] uppercase tracking-widest text-fg-3 mb-3 flex items-center gap-2">
                <span className="material-symbols-outlined text-vi" style={{ fontSize: "13px" }}>psychology</span>
                RAG Memory Hit
              </h3>
              <div className="space-y-2.5">
                {["Similar auth middleware null-check regression fixed in PR #1198 — 3 months ago",
                  "Pattern: selector_mismatch → confidence boost from historical fix data"].map((txt, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <div className="w-1 h-1 rounded-full bg-vi mt-1.5 shrink-0" />
                    <p className="font-mono text-[10px] text-fg-3 leading-relaxed">{txt}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Diff Viewer */}
          <div className="lg:col-span-8 flex flex-col glass-panel rounded-xl overflow-hidden">
            <div className="bg-[var(--bg-elevated)] px-5 py-3 border-b border-[var(--bd)] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-fg-3" style={{ fontSize: "15px" }}>file_open</span>
                <span className="font-mono text-[12px] text-fg-2">src/middleware/auth.guard.ts</span>
              </div>
              <div className="flex items-center gap-3 font-mono text-[10px]">
                <span className="flex items-center gap-1.5 text-pos"><span className="w-1.5 h-1.5 bg-pos rounded-full" />+12</span>
                <span className="flex items-center gap-1.5 text-neg"><span className="w-1.5 h-1.5 bg-neg rounded-full" />-4</span>
              </div>
            </div>
            <div className="flex-1 font-mono text-[12px] leading-6 p-3 overflow-y-auto max-h-[500px]">
              {diffLines.map((line, i) => (
                <div key={i} className={`flex rounded-sm ${line.type === "del" ? "bg-neg/10" : line.type === "add" ? "bg-pos/10" : "hover:bg-[var(--bg-elevated)]"}`}>
                  <span className={`w-10 text-right pr-3 select-none text-[10px] pt-0.5 ${line.type === "del" ? "text-neg/60" : line.type === "add" ? "text-pos/60" : "text-fg-4"}`}>
                    {line.type === "del" ? `‑${line.num}` : line.type === "add" ? `+${line.num}` : line.num}
                  </span>
                  <span className={`pl-2 py-0.5 ${line.type === "del" ? "text-neg" : line.type === "add" ? "text-pos" : "text-fg-3"}`}>
                    {line.content}
                  </span>
                </div>
              ))}
            </div>
            <div className="px-5 py-3 bg-[var(--bg-elevated)] border-t border-[var(--bd)] flex items-center justify-end gap-3">
              <div className="flex -space-x-2">
                <div className="w-7 h-7 rounded-full border-2 border-[var(--bg-card)] bg-[var(--accent-soft)] flex items-center justify-center font-mono text-[9px] text-accent">AI</div>
                <div className="w-7 h-7 rounded-full border-2 border-[var(--bg-card)] bg-[var(--vi-soft)] flex items-center justify-center font-mono text-[9px] text-vi">JD</div>
              </div>
              <span className="font-mono text-[10px] text-fg-3">Reviewed by tollGate AI & @j-doe</span>
            </div>
          </div>
        </div>

        {/* Footer metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-5 border-t border-[var(--bd)]">
          {[
            { icon: "speed",    label: "Build Time Impact", value: "-0.4s Optimized",   vc: "text-pos"  },
            { icon: "security", label: "Security Scan",      value: "12 Guards Validated",vc: "text-fg-1" },
            { icon: "history",  label: "Regression Risk",    value: "Minimal (2%)",      vc: "text-fg-1" },
          ].map(({ icon, label, value, vc }) => (
            <div key={label} className="glass-panel p-4 rounded-xl flex items-center gap-4">
              <div className="w-9 h-9 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center text-accent">
                <span className="material-symbols-outlined" style={{ fontSize: "17px" }}>{icon}</span>
              </div>
              <div>
                <div className="font-mono text-[9px] text-fg-3 uppercase tracking-wider">{label}</div>
                <div className={`font-mono text-sm font-bold ${vc}`}>{value}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
