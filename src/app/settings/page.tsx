"use client";

import { useState } from "react";
import TopBar from "@/components/TopBar";

const webhookLogs = [
  { ts: "2024-04-08 14:22:11", type: "INFO", tc: "text-accent",   msg: "RECV: github_push_event from tollgate-api-core (id: 7721)",               status: "STATUS: 200 OK",    sc: "text-pos"    },
  { ts: "2024-04-08 14:22:15", type: "HEAL", tc: "text-vi",       msg: "ANALYSIS: Pattern match in src/lib/auth.ts — triggers: confidence=92%",   status: "QUEUE: PR_GEN_901", sc: "text-accent"  },
  { ts: "2024-04-08 14:23:01", type: "INFO", tc: "text-accent",   msg: "RECV: slack_command_verify (id: 8812)",                                    status: "STATUS: 200 OK",    sc: "text-pos"    },
  { ts: "2024-04-08 14:23:45", type: "CRON", tc: "text-fg-3",     msg: "CRON: Nightly maintenance scan initiated.",                                status: "ACTIVE",            sc: "text-data"   },
  { ts: "2024-04-08 14:24:12", type: "INFO", tc: "text-fg-4",     msg: "HEARTBEAT: Service node alpha-01 responding.",                             status: "OK",                sc: "text-fg-4"   },
];

const credentials = [
  { name: "GitHub App",           accent: "border-accent", masked: "ghp_************************",  updated: "May 12" },
  { name: "Anthropic (Claude 3.5)", accent: "border-vi",   masked: "sk-ant-************************", updated: "Jun 01" },
  { name: "Slack Bot Token",      accent: "border-data",   masked: "xoxb-************************", updated: "Apr 20" },
];

const repoList = [
  { icon: "folder_special", name: "tollgate-api-core",       branch: "main",       synced: "2m ago",  active: true  },
  { icon: "account_tree",   name: "frontend-mission-control", branch: "staging",   synced: "45m ago", active: false },
  { icon: "schema",         name: "data-pipeline-v4",        branch: "production", synced: "12s ago", active: true  },
];

function Toggle({ on }: { on: boolean }) {
  const [enabled, setEnabled] = useState(on);
  return (
    <button
      onClick={() => setEnabled(!enabled)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${enabled ? "bg-accent" : "bg-[var(--bg-elevated)]"}`}
    >
      <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ${enabled ? "translate-x-4" : "translate-x-0"}`} />
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

        <div className="mb-10">
          <h1 className="text-4xl font-headline font-bold text-fg-1 tracking-tight mb-1">Configuration Matrix</h1>
          <p className="font-mono text-[11px] text-fg-4 uppercase tracking-widest">
            Manage global agent behaviors, repository hooks, and neural core integrations.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">

          {/* ── Watched Repositories ── */}
          <div className="md:col-span-8 glass-panel rounded-xl p-6 overflow-hidden">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-accent" style={{ fontSize: "18px" }}>database</span>
                <h2 className="font-headline text-lg font-bold text-fg-1">Watched Repositories</h2>
              </div>
              <button className="font-mono text-[10px] text-accent border border-accent/30 px-3 py-1.5 rounded-lg hover:bg-[var(--accent-soft)] transition-all uppercase tracking-widest">
                + Add Repo
              </button>
            </div>
            <div className="space-y-3">
              {repoList.map((r) => (
                <div key={r.name} className="flex items-center justify-between p-4 bg-[var(--bg-elevated)] rounded-lg hover:bg-[var(--bg-card)] transition-colors group">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-[var(--bg-card)] rounded-lg flex items-center justify-center">
                      <span className="material-symbols-outlined text-fg-3" style={{ fontSize: "20px" }}>{r.icon}</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm text-fg-1">{r.name}</span>
                        {r.active
                          ? <div className="w-1.5 h-1.5 rounded-full bg-pos animate-pulse" />
                          : <div className="w-1.5 h-1.5 rounded-full bg-[var(--bd-2)]" />
                        }
                      </div>
                      <span className="font-mono text-[9px] text-fg-4 uppercase tracking-widest">
                        Branch: {r.branch} · Last synced {r.synced}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[9px] text-fg-4 uppercase tracking-widest">Auto-Heal</span>
                      <Toggle on={r.active} />
                    </div>
                    <button className="material-symbols-outlined text-fg-3 hover:text-neg transition-colors" style={{ fontSize: "18px" }}>
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
              <span className="material-symbols-outlined text-vi" style={{ fontSize: "18px" }}>neurology</span>
              <h2 className="font-headline text-base font-bold text-fg-1">Inference Engine</h2>
            </div>
            <div className="space-y-8">
              {/* Confidence slider */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="font-mono text-[9px] text-fg-4 uppercase tracking-widest">
                    PR Confidence Threshold
                  </label>
                  <span className="font-mono text-xs text-accent font-bold">{threshold}%</span>
                </div>
                <input
                  type="range" min={0} max={100} value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                  className="w-full h-1 rounded-lg appearance-none cursor-pointer accent-accent bg-[var(--bg-elevated)]"
                />
                <p className="mt-2 font-mono text-[9px] text-fg-4 leading-tight italic">
                  Minimum LLM confidence required to auto-generate a PR without manual review.
                </p>
              </div>

              {/* Heal attempts */}
              <div>
                <div className="flex justify-between items-center mb-3">
                  <label className="font-mono text-[9px] text-fg-4 uppercase tracking-widest">
                    Max Heal Attempts / Hour
                  </label>
                  <span className="font-mono text-xs text-accent font-bold">12</span>
                </div>
                <div className="grid grid-cols-6 gap-1">
                  {[1, 2, 3, 4, 5, 6].map((seg) => (
                    <div key={seg} className={`h-2 rounded-sm ${seg <= 4 ? "bg-accent" : "bg-[var(--bg-elevated)]"}`} />
                  ))}
                </div>
              </div>

              {/* Webhook status */}
              <div className="pt-4 border-t border-[var(--bd)]">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-mono text-[9px] text-fg-4 uppercase tracking-widest">Status Webhooks</span>
                  <span className="font-mono text-[9px] bg-[var(--accent-soft)] text-accent px-2 py-0.5 rounded uppercase">ACTIVE</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-pos animate-pulse" />
                  <span className="font-mono text-[10px] text-fg-3 truncate">https://api.tollgate.ai/v1/hooks/tx-99</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Integration Credentials ── */}
          <div className="md:col-span-12 glass-panel rounded-xl p-6">
            <div className="flex items-center gap-2 mb-6">
              <span className="material-symbols-outlined text-accent" style={{ fontSize: "18px" }}>vpn_key</span>
              <h2 className="font-headline text-lg font-bold text-fg-1">Integration Credentials</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {credentials.map((cred, i) => (
                <div key={cred.name} className={`bg-[var(--bg-elevated)] p-5 rounded-lg border-l-2 ${cred.accent}`}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-6 h-6 rounded bg-[var(--bg-card)] flex items-center justify-center">
                      <span className="material-symbols-outlined text-fg-3" style={{ fontSize: "14px" }}>key</span>
                    </div>
                    <span className="font-mono text-sm font-bold text-fg-1">{cred.name}</span>
                  </div>
                  <div className="relative">
                    <input
                      type={showPw[i] ? "text" : "password"}
                      readOnly
                      value={cred.masked}
                      className="w-full bg-[var(--bg-card)] border border-[var(--bd)] font-mono text-xs text-fg-3 rounded px-3 py-2 pr-9 focus:outline-none focus:ring-1 focus:ring-accent/20"
                    />
                    <button
                      onClick={() => togglePw(i)}
                      className="absolute right-2.5 top-2 text-fg-4 hover:text-accent transition-colors"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
                        {showPw[i] ? "visibility_off" : "visibility"}
                      </span>
                    </button>
                  </div>
                  <div className="mt-3 flex justify-between items-center">
                    <span className="font-mono text-[9px] text-fg-4 uppercase">Updated: {cred.updated}</span>
                    <button className="font-mono text-[9px] text-accent uppercase tracking-widest hover:underline">Rotate Key</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Webhook Telemetry ── */}
          <div className="md:col-span-12 glass-panel rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-[var(--bd)] flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-accent" style={{ fontSize: "18px" }}>analytics</span>
                <h2 className="font-headline text-lg font-bold text-fg-1">Webhook Telemetry</h2>
              </div>
              <div className="flex gap-5">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-pos" />
                  <span className="font-mono text-[9px] uppercase tracking-widest text-fg-3">Success: 99.8%</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-neg" />
                  <span className="font-mono text-[9px] uppercase tracking-widest text-fg-3">Drops: 0.02%</span>
                </div>
              </div>
            </div>
            <div className="bg-[var(--bg-card)] font-mono text-[11px] p-5 h-48 overflow-y-auto terminal-scroll space-y-1">
              {webhookLogs.map((log, i) => (
                <div key={i} className={`flex gap-4 text-fg-3 ${i > 2 ? "opacity-" + (i === 3 ? "50" : "30") : ""}`}>
                  <span className="text-data/70 shrink-0 tabular-nums">[{log.ts}]</span>
                  <span className={`${log.tc} shrink-0 w-10`}>{log.type}</span>
                  <span className="flex-1 min-w-0 truncate">{log.msg}</span>
                  <span className={`${log.sc} shrink-0 ml-auto`}>{log.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Global actions */}
        <div className="mt-10 flex justify-end gap-4">
          <button className="px-6 py-2.5 border border-[var(--bd)] text-fg-3 hover:text-fg-1 hover:bg-[var(--bg-elevated)] transition-all font-mono text-[10px] uppercase tracking-widest rounded-lg">
            Reset to Factory Defaults
          </button>
          <button className="px-8 py-2.5 kinetic-gradient text-white font-headline font-bold text-sm uppercase tracking-widest rounded-lg hover:opacity-90 active:scale-95 transition-all shadow-[0_4px_15px_var(--accent-soft)]">
            Commit Global Config
          </button>
        </div>
      </main>
    </>
  );
}
