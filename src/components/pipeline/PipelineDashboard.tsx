"use client";

import { useCallback, useEffect, useState } from "react";
import TopBar from "@/components/TopBar";
import type { PipelineSnapshot } from "@/lib/pipeline/types";
import PipelineFlowDiagram from "./PipelineFlowDiagram";
import LivePipelineTerminal from "./LivePipelineTerminal";

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

export default function PipelineDashboard() {
  const [snapshot, setSnapshot] = useState<PipelineSnapshot>(emptySnapshot);
  const [sseOk, setSseOk] = useState(false);

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

  const reset = useCallback(async () => {
    await fetch("/api/agent/pipeline/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset" }),
    });
  }, []);

  const simulate = useCallback(async () => {
    await fetch("/api/agent/pipeline/simulate", { method: "POST" });
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-base)]">
      <TopBar activeLabel="Pipeline" />

      <div className="flex-1 flex flex-col min-h-0 px-4 py-3 md:px-5 md:py-4 gap-3">
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-1 h-8 rounded-full bg-gradient-to-b from-[var(--accent)] to-[var(--vi)]" />
            <div>
              <h1 className="font-headline text-xl md:text-2xl font-bold text-fg-1 tracking-tight leading-none">
                Multi-Agent Pipeline
              </h1>
              <p className="font-mono text-[10px] text-fg-4 mt-1">
                Live agent flow — updates in real time
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* SSE live indicator */}
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
              className="kinetic-gradient text-white font-mono font-bold text-[11px] uppercase tracking-wider py-2 px-4 rounded-lg flex items-center gap-2 hover:opacity-90 active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
                play_arrow
              </span>
              Run Pipeline
            </button>

            <button
              type="button"
              onClick={reset}
              className="bg-[var(--bg-elevated)] border border-[var(--bd)] text-fg-2 font-mono font-bold text-[11px] uppercase tracking-wider py-2 px-4 rounded-lg flex items-center gap-2 hover:border-[var(--bd-2)] active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
                refresh
              </span>
              Reset
            </button>
          </div>
        </header>

        {/* 60 / 40 split — flow | terminal */}
        <div
          className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-4 flex-1 min-h-0 lg:min-h-[calc(100vh-10rem)]"
        >
          {/* ── Flow Diagram (60%) ── */}
          <section className="flex flex-col min-h-[min(60vh,560px)] lg:min-h-0 min-w-0 rounded-2xl border border-[var(--glass-bd)] overflow-hidden" style={{ background: "#08090f" }}>
            <div className="shrink-0 px-4 py-2.5 border-b flex items-center gap-2" style={{ borderColor: "rgba(255,255,255,0.06)", background: "#0d0e1a" }}>
              <span className="material-symbols-outlined text-accent" style={{ fontSize: "15px" }}>
                account_tree
              </span>
              <span className="font-mono text-[10px] uppercase tracking-widest font-bold" style={{ color: "rgba(255,255,255,0.5)" }}>
                Live Agent Flow
              </span>
              <span className="ml-auto font-mono text-[9px]" style={{ color: "rgba(255,255,255,0.2)" }}>
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
      </div>
    </div>
  );
}
