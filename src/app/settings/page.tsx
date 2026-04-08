"use client";

import { useState } from "react";
import TopBar from "@/components/TopBar";

const webhookLogs = [
  { ts: "2024-04-08 14:22:11", type: "INFO", typeColor: "text-secondary",           msg: "RECV: github_push_event from tollgate-api-core (id: 7721)",                   status: "STATUS: 200 OK",      statusColor: "text-[#00f5ff]" },
  { ts: "2024-04-08 14:22:15", type: "HEAL", typeColor: "text-tertiary-fixed",       msg: "ANALYSIS: Pattern match in src/lib/auth.ts — triggers: confidence=92%",        status: "QUEUE: PR_GEN_901",   statusColor: "text-[#00f5ff]" },
  { ts: "2024-04-08 14:23:01", type: "INFO", typeColor: "text-secondary",           msg: "RECV: slack_command_verify (id: 8812)",                                         status: "STATUS: 200 OK",      statusColor: "text-[#00f5ff]" },
  { ts: "2024-04-08 14:23:45", type: "CRON", typeColor: "text-[#b9caca]/40",        msg: "CRON: Nightly maintenance scan initiated.",                                      status: "ACTIVE",              statusColor: "text-[#00f5ff]/50" },
  { ts: "2024-04-08 14:24:12", type: "INFO", typeColor: "text-[#b9caca]/20",        msg: "HEARTBEAT: Service node alpha-01 responding.",                                   status: "OK",                  statusColor: "text-[#00f5ff]/20" },
];

const credentials = [
  { name: "GitHub App",          accent: "border-[#00dce5]",   masked: "ghp_************************",  updated: "May 12" },
  { name: "Anthropic (Claude 3.5)", accent: "border-secondary", masked: "sk-ant-************************", updated: "Jun 01" },
  { name: "Slack Bot Token",     accent: "border-tertiary-fixed-dim", masked: "xoxb-************************", updated: "Apr 20" },
];

const repos = [
  { icon: "folder_special", name: "tollgate-api-core",       branch: "main",       synced: "2m ago",  active: true  },
  { icon: "account_tree",   name: "frontend-mission-control", branch: "staging",   synced: "45m ago", active: false },
  { icon: "schema",         name: "data-pipeline-v4",        branch: "production", synced: "12s ago", active: true  },
];

function Toggle({ on }: { on: boolean }) {
  const [enabled, setEnabled] = useState(on);
  return (
    <button
      onClick={() => setEnabled(!enabled)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${enabled ? "bg-[#00f5ff]" : "bg-white/10"}`}
    >
      <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-[#0a0a0f] shadow transition duration-200 ${enabled ? "translate-x-4" : "translate-x-0"}`} />
    </button>
  );
}

export default function SettingsPage() {
  const [threshold, setThreshold] = useState(85);
  const [showPw, setShowPw] = useState([false, false, false]);

  const togglePw = (i: number) =>
    setShowPw((p) => p.map((v, idx) => (idx === i ? !v : v)));

  return (
    <>
      <TopBar activeLabel="Settings" />

      <main className="md:px-8 px-5 pb-14 pt-8 max-w-6xl mx-auto">

        {/* Page header */}
        <div className="mb-10">
          <h1 className="text-4xl font-headline font-bold text-primary tracking-tight mb-1">Configuration Matrix</h1>
          <p className="font-mono text-[11px] text-[#b9caca]/40 uppercase tracking-widest">
            Manage global agent behaviors, repository hooks, and neural core integrations.
          </p>
        </div>

        {/* Bento grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">

          {/* ── Watched Repositories ── */}
          <div className="md:col-span-8 glass-panel rounded-xl p-6 overflow-hidden">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#00dce5]" style={{ fontSize: "18px" }}>database</span>
                <h2 className="font-headline text-lg font-bold uppercase tracking-wider text-primary">Watched Repositories</h2>
              </div>
              <button className="font-mono text-[10px] text-[#00dce5] border border-[#00dce5]/30 px-3 py-1.5 rounded hover:bg-[#00dce5]/10 transition-all uppercase tracking-widest">
                + Add Repo
              </button>
            </div>
            <div className="space-y-3">
              {repos.map((r) => (
                <div key={r.name} className="flex items-center justify-between p-4 bg-white/3 rounded-lg hover:bg-white/5 transition-colors group">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-white/5 rounded-lg flex items-center justify-center">
                      <span className="material-symbols-outlined text-[#b9caca]/40" style={{ fontSize: "20px" }}>{r.icon}</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm text-primary">{r.name}</span>
                        {r.active ? <div className="pulse-indicator" /> : <div className="w-1 h-1 rounded-full bg-white/20" />}
                      </div>
                      <span className="font-mono text-[9px] text-[#b9caca]/30 uppercase tracking-widest">
                        Branch: {r.branch} · Last synced {r.synced}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[9px] text-[#b9caca]/30 uppercase tracking-widest">Auto-Heal</span>
                      <Toggle on={r.active} />
                    </div>
                    <button className="material-symbols-outlined text-[#b9caca]/20 hover:text-error transition-colors" style={{ fontSize: "18px" }}>
                      delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Inference Engine ── */}
          <div className="md:col-span-4 glass-panel rounded-xl p-6">
            <div className="flex items-center gap-2 mb-6">
              <span className="material-symbols-outlined text-tertiary-fixed-dim" style={{ fontSize: "18px" }}>neurology</span>
              <h2 className="font-headline text-base font-bold uppercase tracking-wider text-primary">Inference Engine</h2>
            </div>
            <div className="space-y-8">
              {/* Confidence slider */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="font-mono text-[9px] text-[#b9caca]/40 uppercase tracking-widest">
                    PR Confidence Threshold
                  </label>
                  <span className="font-mono text-xs text-[#00dce5]">{threshold}%</span>
                </div>
                <input
                  type="range" min={0} max={100} value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                  className="w-full h-1 rounded-lg appearance-none cursor-pointer accent-[#00f5ff] bg-white/5"
                />
                <p className="mt-2 font-mono text-[9px] text-[#b9caca]/30 leading-tight italic">
                  Minimum LLM confidence required to auto-generate a PR without manual review.
                </p>
              </div>

              {/* Heal attempts */}
              <div>
                <div className="flex justify-between items-center mb-3">
                  <label className="font-mono text-[9px] text-[#b9caca]/40 uppercase tracking-widest">
                    Max Heal Attempts / Hour
                  </label>
                  <span className="font-mono text-xs text-[#00dce5]">12</span>
                </div>
                <div className="grid grid-cols-6 gap-1">
                  {[1,2,3,4,5,6].map((seg) => (
                    <div key={seg} className={`h-2 rounded-sm ${seg <= 4 ? "bg-[#00f5ff]" : "bg-white/5"}`} />
                  ))}
                </div>
              </div>

              {/* Webhook status */}
              <div className="pt-4 border-t border-white/5">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-mono text-[9px] text-[#b9caca]/40 uppercase tracking-widest">Status Webhooks</span>
                  <span className="font-mono text-[9px] bg-[#00f5ff]/10 text-[#00dce5] px-2 py-0.5 rounded uppercase">ACTIVE</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#00f5ff] shadow-[0_0_8px_#00f5ff]" />
                  <span className="font-mono text-[10px] text-[#b9caca]/40 truncate">https://api.tollgate.ai/v1/hooks/tx-99</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Integration Credentials ── */}
          <div className="md:col-span-12 glass-panel rounded-xl p-6">
            <div className="flex items-center gap-2 mb-6">
              <span className="material-symbols-outlined text-secondary-fixed-dim" style={{ fontSize: "18px" }}>vpn_key</span>
              <h2 className="font-headline text-lg font-bold uppercase tracking-wider text-primary">Integration Credentials</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {credentials.map((cred, i) => (
                <div key={cred.name} className={`bg-white/3 p-5 rounded-lg border-l-2 ${cred.accent}`}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-6 h-6 rounded bg-white/5 flex items-center justify-center">
                      <span className="material-symbols-outlined text-[#b9caca]/50" style={{ fontSize: "14px" }}>key</span>
                    </div>
                    <span className="font-mono text-sm font-bold text-on-surface">{cred.name}</span>
                  </div>
                  <div className="relative">
                    <input
                      type={showPw[i] ? "text" : "password"}
                      readOnly
                      value={cred.masked}
                      className="w-full bg-[#0a0a0f] border border-white/5 font-mono text-xs text-[#b9caca]/50 rounded px-3 py-2 pr-9 focus:outline-none focus:ring-1 focus:ring-[#00f5ff]/20"
                    />
                    <button
                      onClick={() => togglePw(i)}
                      className="absolute right-2.5 top-2 text-[#b9caca]/30 hover:text-[#00dce5] transition-colors"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
                        {showPw[i] ? "visibility_off" : "visibility"}
                      </span>
                    </button>
                  </div>
                  <div className="mt-3 flex justify-between items-center">
                    <span className="font-mono text-[9px] text-[#b9caca]/30 uppercase">Updated: {cred.updated}</span>
                    <button className="font-mono text-[9px] text-[#00dce5] uppercase tracking-widest hover:underline">Rotate Key</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Webhook Telemetry ── */}
          <div className="md:col-span-12 glass-panel rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-white/5 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#00dce5]" style={{ fontSize: "18px" }}>analytics</span>
                <h2 className="font-headline text-lg font-bold uppercase tracking-wider text-primary">Webhook Telemetry</h2>
              </div>
              <div className="flex gap-5">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#00f5ff]" />
                  <span className="font-mono text-[9px] uppercase tracking-widest text-[#b9caca]/40">Success: 99.8%</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-error" />
                  <span className="font-mono text-[9px] uppercase tracking-widest text-[#b9caca]/40">Drops: 0.02%</span>
                </div>
              </div>
            </div>
            <div className="bg-[#050508] font-mono text-[11px] p-5 h-48 overflow-y-auto terminal-scroll space-y-1">
              {webhookLogs.map((log, i) => (
                <div key={i} className={`flex gap-4 text-[#b9caca]/50 ${i > 2 ? "opacity-" + (i === 3 ? "40" : "20") : ""}`}>
                  <span className="text-[#00dce5]/60 shrink-0 tabular-nums">[{log.ts}]</span>
                  <span className={`${log.typeColor} shrink-0 w-10`}>{log.type}</span>
                  <span className="flex-1 min-w-0 truncate">{log.msg}</span>
                  <span className={`${log.statusColor} shrink-0 ml-auto`}>{log.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Global actions */}
        <div className="mt-10 flex justify-end gap-4">
          <button className="px-6 py-2.5 border border-white/10 text-[#b9caca]/50 hover:text-primary hover:bg-white/5 transition-all font-mono text-[10px] uppercase tracking-widest rounded-lg">
            Reset to Factory Defaults
          </button>
          <button className="px-8 py-2.5 bg-[#00f5ff] text-[#003739] font-headline font-bold text-sm uppercase tracking-widest rounded-lg shadow-[0_0_20px_rgba(0,245,255,0.2)] hover:brightness-110 transition-all active:scale-95">
            Commit Global Config
          </button>
        </div>
      </main>
    </>
  );
}
