"use client";

import { useEffect, useRef } from "react";
import type { PipelineSnapshot } from "@/lib/pipeline/types";

function formatTime(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return iso.slice(11, 19);
  }
}

/** Map a step id to a short coloured tag */
const STEP_COLORS: Record<string, string> = {
  code_push:       "#6366f1",
  architect:       "#a855f7",
  scripter:        "#06b6d4",
  tests_gate:      "#f59e0b",
  courier:         "#10b981",
  watchdog:        "#f97316",
  healer:          "#ec4899",
  confidence_gate: "#8b5cf6",
  ship:            "#22c55e",
  block:           "#ef4444",
};

export default function LivePipelineTerminal({
  snapshot,
  className = "",
}: {
  snapshot: PipelineSnapshot;
  className?: string;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [snapshot.logs.length, snapshot.updatedAt]);

  return (
    <div
      className={`flex flex-col h-full min-h-0 rounded-2xl overflow-hidden border border-[var(--glass-bd)] ${className}`}
      style={{ background: "#08090f" }}
    >
      {/* Terminal header */}
      <div
        className="shrink-0 px-4 py-2.5 border-b flex items-center justify-between"
        style={{ borderColor: "rgba(255,255,255,0.06)", background: "#0d0e1a" }}
      >
        <div className="flex items-center gap-2.5">
          {/* Mac-style traffic lights */}
          <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
          <span
            className="font-mono text-[10px] uppercase tracking-widest ml-2"
            style={{ color: "rgba(255,255,255,0.35)" }}
          >
            Agent Logs
          </span>
        </div>
        <span className="flex items-center gap-1.5 font-mono text-[9px]" style={{ color: "rgba(255,255,255,0.3)" }}>
          <span className="pulse-indicator" />
          SSE
        </span>
      </div>

      {/* Log output */}
      <div
        className="flex-1 min-h-0 font-mono text-[11.5px] leading-relaxed p-4 overflow-y-auto terminal-scroll space-y-1"
        style={{ color: "rgba(255,255,255,0.55)" }}
      >
        {snapshot.logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 select-none">
            <span
              className="material-symbols-outlined"
              style={{ fontSize: "36px", color: "rgba(255,255,255,0.1)" }}
            >
              terminal
            </span>
            <p style={{ color: "rgba(255,255,255,0.2)" }} className="text-[11px]">
              Waiting for agent activity…
            </p>
            <p style={{ color: "rgba(255,255,255,0.12)" }} className="text-[10px]">
              Run the pipeline to see live logs
            </p>
          </div>
        ) : (
          snapshot.logs.map((line, i) => {
            const stepColor = line.step ? (STEP_COLORS[line.step] ?? "#818cf8") : undefined;
            return (
              <div key={`${line.ts}-${i}`} className="flex gap-2 break-words items-start hover:bg-white/[0.02] rounded px-1 -mx-1 transition-colors">
                {/* Timestamp */}
                <span
                  className="shrink-0 select-none tabular-nums text-[10px] mt-0.5"
                  style={{ color: "rgba(255,255,255,0.2)" }}
                >
                  {formatTime(line.ts)}
                </span>

                {/* Step tag */}
                {line.step && (
                  <span
                    className="shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded mt-0.5"
                    style={{
                      color: stepColor,
                      background: stepColor ? `${stepColor}20` : "transparent",
                      border: `1px solid ${stepColor}40`,
                    }}
                  >
                    {line.step.replace(/_/g, " ")}
                  </span>
                )}

                {/* Message */}
                <span
                  className={
                    line.level === "error"
                      ? "text-[#f87171]"
                      : line.level === "success"
                        ? "text-[#4ade80]"
                        : line.level === "warn"
                          ? "text-[#fbbf24]"
                          : undefined
                  }
                  style={
                    !line.level || line.level === "info"
                      ? { color: "rgba(255,255,255,0.65)" }
                      : undefined
                  }
                >
                  {line.message}
                </span>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
