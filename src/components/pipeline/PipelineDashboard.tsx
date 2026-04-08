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
  const [slackHint, setSlackHint] = useState<string | null>(null);
  const [slackIsError, setSlackIsError] = useState(false);
  const [slackBusy, setSlackBusy] = useState(false);

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

  const testSlack = useCallback(async () => {
    setSlackBusy(true);
    setSlackHint(null);
    try {
      const res = await fetch("/api/integrations/slack/test", { method: "POST" });
      const data = (await res.json()) as { ok?: boolean; message?: string; error?: string; detail?: string };
      if (!res.ok) {
        setSlackIsError(true);
        setSlackHint(data.error ?? data.detail ?? "Slack test failed");
        return;
      }
      setSlackIsError(false);
      setSlackHint(data.message ?? "Sent — check Slack.");
    } catch {
      setSlackIsError(true);
      setSlackHint("Network error calling Slack test.");
    } finally {
      setSlackBusy(false);
    }
  }, []);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const webhookUrl = `${origin}/api/agent/pipeline/webhook`;
  const perAgentSteps = [
    "code_push",
    "architect",
    "scripter",
    "tests_gate",
    "courier",
    "watchdog",
    "healer",
    "confidence_gate",
    "ship",
    "block",
  ] as const;

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar activeLabel="Pipeline" />

      <div className="flex-1 flex flex-col min-h-0 px-4 py-3 md:px-5 md:py-4 gap-3">
        <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 shrink-0">
          <div>
            <h1 className="font-headline text-xl md:text-2xl font-bold text-fg-1 tracking-tight">Multi-agent pipeline</h1>
            <p className="font-mono text-[10px] text-fg-3 mt-0.5 max-w-xl leading-snug">
              Split view: flow and terminal update live over SSE. Webhook URLs are in the panel below.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={simulate}
              className="kinetic-gradient text-white font-mono font-bold text-[11px] uppercase tracking-wider py-2 px-3 md:py-2.5 md:px-4 rounded-lg flex items-center gap-2 hover:opacity-90 transition-opacity"
            >
              <span className="material-symbols-outlined" style={{ fontSize: "17px" }}>
                play_arrow
              </span>
              Run demo
            </button>
            <button
              type="button"
              onClick={reset}
              className="bg-[var(--bg-elevated)] border border-[var(--bd)] text-fg-2 font-mono font-bold text-[11px] uppercase tracking-wider py-2 px-3 md:py-2.5 md:px-4 rounded-lg flex items-center gap-2 hover:border-[var(--bd-2)] transition-colors"
            >
              <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
                refresh
              </span>
              Reset
            </button>
            <button
              type="button"
              onClick={testSlack}
              disabled={slackBusy}
              className="bg-[var(--vi-soft)] border border-vi/30 text-vi font-mono font-bold text-[11px] uppercase tracking-wider py-2 px-3 md:py-2.5 md:px-4 rounded-lg flex items-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
                chat
              </span>
              {slackBusy ? "Slack…" : "Test Slack"}
            </button>
            <span
              className={`font-mono text-[9px] px-2 py-1 rounded border ${
                sseOk ? "border-pos/40 text-pos" : "border-[var(--bd)] text-fg-4"
              }`}
              title="Event stream status"
            >
              {sseOk ? "Live" : "Connecting…"}
            </span>
          </div>
        </header>

        {slackHint && (
          <p
            className={`font-mono text-[10px] shrink-0 px-2 py-1.5 rounded border ${
              slackIsError ? "border-neg/40 text-neg bg-neg/5" : "border-pos/40 text-pos bg-pos/5"
            }`}
          >
            {slackHint}
          </p>
        )}

        <details className="glass-panel rounded-xl border border-[var(--glass-bd)] shrink-0 group open:shadow-sm">
          <summary className="cursor-pointer list-none font-mono text-[10px] uppercase tracking-widest text-fg-3 px-4 py-3 flex items-center justify-between gap-2 hover:text-accent transition-colors">
            <span className="flex items-center gap-2">
              <span className="material-symbols-outlined text-accent" style={{ fontSize: "16px" }}>
                link
              </span>
              Agent webhooks
            </span>
            <span className="material-symbols-outlined text-fg-4 group-open:rotate-180 transition-transform" style={{ fontSize: "18px" }}>
              expand_more
            </span>
          </summary>
          <div className="px-4 pb-4 pt-0 space-y-3 border-t border-[var(--bd)]">
            <div>
              <code className="block font-mono text-[10px] text-accent break-all bg-[var(--bg-elevated)] px-3 py-2 rounded-lg border border-[var(--bd)]">
                POST {webhookUrl}
              </code>
              <p className="font-mono text-[9px] text-fg-4 mt-2 leading-relaxed">
                Include <span className="text-fg-3">step</span> in JSON or use per-step URLs. Optional{" "}
                <span className="text-fg-3">PIPELINE_WEBHOOK_SECRET</span>. Docs:{" "}
                <span className="text-fg-3">GET {webhookUrl}</span>
              </p>
            </div>
            <div>
              <h3 className="font-mono text-[9px] uppercase tracking-widest text-fg-4 mb-1.5">Per-agent (path)</h3>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 font-mono text-[9px] text-fg-3 max-h-28 overflow-y-auto terminal-scroll">
                {perAgentSteps.map((id) => (
                  <li key={id} className="truncate" title={`POST ${origin}/api/agent/pipeline/webhook/${id}`}>
                    <span className="text-accent">{id}</span>
                    {" → "}
                    <span className="text-fg-2 break-all">{webhookUrl}/{id}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </details>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-0 lg:min-h-[calc(100vh-13.5rem)]">
          <section className="flex flex-col min-h-[min(52vh,520px)] lg:min-h-0 min-w-0">
            <h2 className="font-mono text-[10px] uppercase tracking-widest text-fg-3 mb-3 md:mb-4 flex items-center gap-2 shrink-0 pb-2 border-b border-[var(--bd)]/80">
              <span className="material-symbols-outlined text-accent" style={{ fontSize: "15px" }}>
                account_tree
              </span>
              Live agent flow
            </h2>
            <div className="flex-1 min-h-[440px] lg:min-h-0 w-full pt-1">
              <PipelineFlowDiagram snapshot={snapshot} />
            </div>
          </section>

          <section className="flex flex-col min-h-[min(52vh,520px)] lg:min-h-0 min-w-0">
            <h2 className="font-mono text-[10px] uppercase tracking-widest text-fg-3 mb-2 md:mb-3 flex items-center gap-2 shrink-0 lg:hidden">
              <span className="material-symbols-outlined text-accent" style={{ fontSize: "15px" }}>
                terminal
              </span>
              Live terminal
            </h2>
            <LivePipelineTerminal snapshot={snapshot} className="flex-1 min-h-[360px] lg:min-h-0" />
          </section>
        </div>
      </div>
    </div>
  );
}
