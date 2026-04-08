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
      className={`flex flex-col h-full min-h-0 glass-panel rounded-xl overflow-hidden border border-[var(--glass-bd)] ${className}`}
    >
      <div className="shrink-0 px-4 py-2.5 border-b border-[var(--bd)] flex items-center justify-between bg-[var(--bg-elevated)]">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-fg-3" style={{ fontSize: "16px" }}>
            terminal
          </span>
          <span className="font-mono text-[11px] uppercase tracking-widest text-fg-2">Live terminal</span>
        </div>
        <span className="flex items-center gap-1.5 font-mono text-[9px] text-fg-4">
          <span className="pulse-indicator" />
          SSE
        </span>
      </div>
      <div className="flex-1 min-h-0 font-mono text-[12px] leading-relaxed p-4 md:p-5 overflow-y-auto terminal-scroll bg-[#050508] text-fg-2 space-y-1.5">
        {snapshot.logs.length === 0 ? (
          <p className="text-fg-4 italic">Waiting for agent webhooks… POST to /api/agent/pipeline/webhook</p>
        ) : (
          snapshot.logs.map((line, i) => (
            <div key={`${line.ts}-${i}`} className="flex gap-2 break-words">
              <span className="text-fg-4 shrink-0 select-none">{formatTime(line.ts)}</span>
              {line.step && (
                <span className="text-accent shrink-0">
                  [{line.step}]
                </span>
              )}
              <span
                className={
                  line.level === "error"
                    ? "text-neg"
                    : line.level === "success"
                      ? "text-pos"
                      : line.level === "warn"
                        ? "text-warn"
                        : "text-fg-2"
                }
              >
                {line.message}
              </span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
