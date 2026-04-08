"use client";

import { useEffect, useRef, useState } from "react";
import TopBar from "@/components/TopBar";
import type { PipelineSnapshot, LogEntry } from "@/lib/pipeline/types";

/* ─── static agent squad config (names / icons only — status comes from SSE) ─── */
const AGENT_CFG = [
  { icon: "architecture",   id: "architect",  name: "Architect" },
  { icon: "smart_toy",      id: "scripter",   name: "Scripter"  },
  { icon: "healing",        id: "healer",     name: "Healer"    },
  { icon: "local_shipping", id: "courier",    name: "Courier"   },
  { icon: "upload_file",    id: "code_push",  name: "Code Push" },
];

const emptySnapshot = (): PipelineSnapshot => ({
  steps: {
    code_push: "idle", architect: "idle", scripter: "idle",
    tests_gate: "idle", courier: "idle", watchdog: "idle",
    healer: "idle", confidence_gate: "idle", ship: "idle", block: "idle",
  },
  afterTests: null, afterConfidence: null, logs: [], updatedAt: 0,
});

function statusColor(s: string) {
  if (s === "running")   return { bg: "bg-[var(--accent-soft)] text-accent", border: "border-accent" };
  if (s === "completed") return { bg: "bg-pos/10 text-pos",                  border: "border-pos"    };
  if (s === "failed")    return { bg: "bg-neg/10 text-neg",                  border: "border-neg"    };
  return                        { bg: "bg-[var(--bg-elevated)] text-fg-4",   border: "border-[var(--bd-2)]" };
}

function formatTs(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch { return iso.slice(11, 19); }
}

const STEP_LABELS: Record<string, string> = {
  code_push: "Code Push", architect: "Architect", scripter: "Scripter",
  tests_gate: "Tests Gate", courier: "Courier", healer: "Healer",
  confidence_gate: "Confidence Gate", ship: "Ship", block: "Hold",
};

interface ActivityItem { title: string; time: string; err: boolean; desc: string; }

const SearchCenter = () => (
  <div className="flex items-center gap-2 bg-[var(--bg-card)] border border-[var(--bd)] px-3 py-1.5 rounded-lg w-52">
    <span className="material-symbols-outlined text-fg-3" style={{ fontSize: "15px" }}>search</span>
    <input
      className="bg-transparent outline-none text-xs font-mono text-fg-2 placeholder:text-fg-4 w-full"
      placeholder="Jump to command…"
    />
  </div>
);

export default function Dashboard() {
  const [snapshot, setSnapshot] = useState<PipelineSnapshot>(emptySnapshot);
  const [sseOk, setSseOk] = useState(false);
  const prevSteps = useRef<Record<string, string>>({});
  const [activity, setActivity] = useState<ActivityItem[]>([]);

  /* SSE subscription */
  useEffect(() => {
    const es = new EventSource("/api/agent/pipeline/events");
    es.onmessage = (ev) => {
      try {
        const snap = JSON.parse(ev.data) as PipelineSnapshot;
        setSseOk(true);
        setSnapshot(snap);

        const now = new Date().toLocaleTimeString(undefined, { hour12: false, hour: "2-digit", minute: "2-digit" });
        const entries: ActivityItem[] = [];
        for (const [step, status] of Object.entries(snap.steps)) {
          const prev = prevSteps.current[step];
          if (prev !== status) {
            if (status === "completed") {
              entries.push({ title: `${STEP_LABELS[step] ?? step} completed`, time: now, err: false, desc: `Agent step "${STEP_LABELS[step] ?? step}" finished successfully.` });
            } else if (status === "failed") {
              entries.push({ title: `${STEP_LABELS[step] ?? step} failed`, time: now, err: true, desc: `Agent step "${STEP_LABELS[step] ?? step}" encountered an error.` });
            } else if (status === "running") {
              entries.push({ title: `${STEP_LABELS[step] ?? step} started`, time: now, err: false, desc: `Agent step "${STEP_LABELS[step] ?? step}" is now running.` });
            }
          }
        }
        prevSteps.current = { ...snap.steps };
        if (entries.length > 0) setActivity((prev) => [...entries, ...prev].slice(0, 20));
      } catch { /* ignore */ }
    };
    es.onerror = () => setSseOk(false);
    return () => es.close();
  }, []);

  const runningCount   = Object.values(snapshot.steps).filter((s) => s === "running").length;
  const completedCount = Object.values(snapshot.steps).filter((s) => s === "completed").length;
  const failedCount    = Object.values(snapshot.steps).filter((s) => s === "failed").length;

  return (
    <>
      <TopBar center={<SearchCenter />} />

      <div className="p-7 space-y-8 max-w-[1600px]">

        {/* Stat cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[
            { label: "Active Steps",    value: String(runningCount),          unit: "running",  icon: "play_circle", delta: `${completedCount} completed · ${failedCount} failed`,                                                                     dc: runningCount > 0 ? "text-accent" : "text-fg-3" },
            { label: "Pipeline Status", value: sseOk ? "Live" : "—",         unit: "",         icon: sseOk ? "wifi" : "wifi_off", delta: sseOk ? "SSE stream connected" : "Waiting for connection",                                                    dc: sseOk ? "text-pos" : "text-fg-3" },
            { label: "Log Events",      value: String(snapshot.logs.length),  unit: "entries",  icon: "article",     delta: snapshot.logs.length > 0 ? `Last: ${formatTs(snapshot.logs[snapshot.logs.length - 1].ts)}` : "No events yet",              dc: "text-fg-3" },
          ].map(({ label, value, unit, icon, delta, dc }) => (
            <div key={label} className="glass-panel p-6 rounded-xl">
              <p className="font-mono text-[10px] uppercase tracking-widest text-fg-3 mb-1">{label}</p>
              <h3 className="text-3xl font-headline font-bold text-accent">
                {value}<span className="text-sm ml-1 font-normal text-fg-3">{unit}</span>
              </h3>
              <div className={`mt-4 flex items-center gap-1.5 text-xs font-mono ${dc}`}>
                <span className="material-symbols-outlined" style={{ fontSize: "13px" }}>{icon}</span>
                {delta}
              </div>
            </div>
          ))}
        </div>

        {/* Agent Squad */}
        <section>
          <div className="flex justify-between items-end mb-5">
            <div>
              <h2 className="text-lg font-headline font-bold text-fg-1">Agent Squad Status</h2>
              <p className="font-mono text-[10px] text-fg-3 uppercase tracking-widest mt-0.5">Real-time status of your autonomous fleet</p>
            </div>
            <span className={`flex items-center gap-1.5 font-mono text-[9px] px-2.5 py-1 rounded-full border ${sseOk ? "border-pos/40 text-pos" : "border-[var(--bd)] text-fg-4"}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${sseOk ? "bg-pos animate-pulse" : "bg-fg-4"}`} />
              {sseOk ? "Live" : "Connecting…"}
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {AGENT_CFG.map((a) => {
              const status = snapshot.steps[a.id as keyof typeof snapshot.steps] ?? "idle";
              const col = statusColor(status);
              const active = status === "running" || status === "completed";
              const progress = status === "completed" ? 100 : status === "running" ? 60 : 0;
              return (
                <div key={a.id} className={`glass-panel p-5 rounded-xl border-l-2 ${col.border}`}>
                  <div className="flex justify-between items-start mb-4">
                    <span className={`material-symbols-outlined text-2xl ${active ? "text-accent" : "text-fg-4"}`}>{a.icon}</span>
                    <span className={`px-2 py-0.5 rounded font-mono text-[9px] uppercase tracking-widest ${col.bg}`}>{status}</span>
                  </div>
                  <h4 className="font-headline font-bold text-sm text-fg-1 mb-0.5">{a.name}</h4>
                  <p className="font-mono text-[10px] text-fg-4 mb-3">
                    {status === "running" ? "Processing…" : status === "completed" ? "Done" : status === "failed" ? "Error" : "Standby"}
                  </p>
                  <div className="w-full bg-[var(--bg-elevated)] h-0.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${active ? "bg-accent" : "bg-[var(--bd-2)]"} ${status === "running" ? "animate-pulse" : ""}`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Terminal + Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-7">

          <div className="lg:col-span-8 flex flex-col h-[460px]">
            <div className="flex items-center justify-between bg-[var(--bg-elevated)] px-4 py-2 rounded-t-xl border border-[var(--bd)] border-b-0">
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-neg/50" />
                  <div className="w-2.5 h-2.5 rounded-full bg-warn/50" />
                  <div className="w-2.5 h-2.5 rounded-full bg-pos/50" />
                </div>
                <span className="font-mono text-[9px] text-fg-3 uppercase tracking-widest ml-2">Live Stream · Pipeline Agent Logs</span>
              </div>
              <span className={`font-mono text-[9px] ${sseOk ? "text-data animate-pulse" : "text-fg-4"}`}>
                {sseOk ? "● CONNECTED" : "○ WAITING"}
              </span>
            </div>
            <div className="flex-1 bg-[var(--bg-card)] border border-[var(--bd)] rounded-b-xl p-5 font-mono text-[12px] terminal-scroll overflow-y-auto">
              {snapshot.logs.length === 0 ? (
                <p className="text-fg-4 italic">Waiting for pipeline events… run the pipeline to see live logs.</p>
              ) : (
                <div className="space-y-2">
                  {snapshot.logs.map((l: LogEntry, i: number) => (
                    <div key={`${l.ts}-${i}`} className="flex gap-4">
                      <span className="text-fg-4 shrink-0 tabular-nums">{formatTs(l.ts)}</span>
                      {l.step && <span className="text-accent shrink-0">[{l.step}]</span>}
                      <span className={l.level === "error" ? "text-neg" : l.level === "success" ? "text-pos" : l.level === "warn" ? "text-warn" : "text-fg-2"}>
                        {l.message}
                      </span>
                    </div>
                  ))}
                  <div className="flex gap-4">
                    <span className="text-accent animate-pulse font-bold">_</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-4 flex flex-col gap-5">
            <div className="glass-panel p-6 rounded-xl flex-1">
              <h3 className="font-headline font-bold text-sm text-fg-1 mb-5 flex items-center gap-2">
                <span className="material-symbols-outlined text-accent" style={{ fontSize: "17px" }}>history</span>
                Recent Activity
              </h3>
              {activity.length === 0 ? (
                <p className="text-fg-4 font-mono text-[10px] italic">No activity yet — run the pipeline to see events.</p>
              ) : (
                <div className="space-y-5 relative before:absolute before:left-[10px] before:top-2 before:bottom-2 before:w-px before:bg-[var(--bd)]">
                  {activity.slice(0, 6).map((item, i) => (
                    <div key={i} className="relative pl-7">
                      <div className={`absolute left-0 top-1.5 w-5 h-5 rounded-full flex items-center justify-center border ${item.err ? "border-neg/30 bg-neg/10" : "border-accent/30 bg-[var(--accent-soft)]"}`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${item.err ? "bg-neg" : "bg-accent"}`} />
                      </div>
                      <div className="flex justify-between items-start mb-0.5">
                        <p className={`text-xs font-bold ${item.err ? "text-neg" : "text-fg-1"}`}>{item.title}</p>
                        <span className="font-mono text-[9px] text-fg-4">{item.time}</span>
                      </div>
                      <p className="font-mono text-[10px] text-fg-3 leading-relaxed">{item.desc}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
