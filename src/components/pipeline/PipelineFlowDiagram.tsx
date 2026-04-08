"use client";

import type { PipelineSnapshot, StepStatus } from "@/lib/pipeline/types";

/* ── Agent config ── */
const CFG: Record<string, { color: string; icon: string; label: string; sub: string }> = {
  code_push: { color: "#818cf8", icon: "upload_file",   label: "Code Push",     sub: "Trigger" },
  architect: { color: "#c084fc", icon: "architecture",  label: "The Architect", sub: "Planner · AI Coder" },
  scripter:  { color: "#22d3ee", icon: "smart_toy",     label: "The Scripter",  sub: "Playwright MCP" },
  courier:   { color: "#34d399", icon: "send",          label: "Courier",       sub: "All Clear · Slack" },
  healer:    { color: "#f472b6", icon: "healing",       label: "The Healer",    sub: "Debugger · Agent" },
  ship:      { color: "#4ade80", icon: "rocket_launch", label: "Ship",          sub: "GitHub PR" },
  block:     { color: "#f87171", icon: "dangerous",     label: "Hold",          sub: "Escalate" },
};

function statusInfo(status: StepStatus, color: string) {
  if (status === "completed") return { dot: "#4ade80", label: "Done",    glow: `0 0 8px #4ade80` };
  if (status === "running")   return { dot: color,     label: "Running", glow: `0 0 9px ${color}` };
  if (status === "failed")    return { dot: "#f87171", label: "Failed",  glow: "none" };
  return                             { dot: "rgba(255,255,255,0.45)", label: "Idle", glow: "none" };
}

/* ── Shared colors ── */
const ARROW_IDLE   = "rgba(148,163,184,0.55)";   // slate-400 at 55% — clearly visible
const ARROW_ACTIVE = "rgba(129,140,248,0.95)";   // indigo bright

function arrowColor(active: boolean) { return active ? ARROW_ACTIVE : ARROW_IDLE; }

/* ─────────── Card ─────────── */
function AgentCard({
  stepId, status, width = 160,
}: { stepId: string; status: StepStatus; width?: number }) {
  const cfg = CFG[stepId];
  if (!cfg) return null;
  const active = status === "running" || status === "completed";
  const failed = status === "failed";
  const color  = failed ? "#f87171" : cfg.color;
  const st     = statusInfo(status, color);

  return (
    <div style={{
      width: `${width}px`,
      borderRadius: "12px",
      border: `1.5px solid ${active || failed ? color : "rgba(148,163,184,0.35)"}`,
      background: active
        ? `linear-gradient(145deg, ${color}30 0%, ${color}14 100%)`
        : "rgba(20, 22, 40, 0.92)",
      boxShadow: active
        ? `0 0 24px ${color}35, 0 4px 20px rgba(0,0,0,0.6)`
        : "0 2px 10px rgba(0,0,0,0.55)",
      overflow: "hidden",
      position: "relative" as const,
      transition: "all 0.3s ease",
      flexShrink: 0,
    }}>
      {/* Top accent bar */}
      <div style={{ height: "2.5px", background: active || failed ? color : "rgba(148,163,184,0.25)" }} />

      {/* Running pulse ring */}
      {status === "running" && (
        <div className="pipeline-node-running" style={{
          position: "absolute", inset: 0, borderRadius: "12px",
          border: `1px solid ${color}80`, pointerEvents: "none",
        }} />
      )}

      {/* Icon */}
      <div style={{ display: "flex", justifyContent: "center", paddingTop: "10px", paddingBottom: "3px" }}>
        <div style={{
          width: "36px", height: "36px", borderRadius: "9px",
          display: "flex", alignItems: "center", justifyContent: "center",
          background: `${color}${active ? "28" : "1a"}`,
          border: `1px solid ${color}${active ? "55" : "38"}`,
        }}>
          <span className="material-symbols-outlined"
            style={{ fontSize: "19px", color: active || failed ? color : `${color}cc` }}>
            {cfg.icon}
          </span>
        </div>
      </div>

      {/* Text */}
      <div style={{ padding: "3px 10px 5px", textAlign: "center" as const }}>
        <p style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: "9.5px", fontWeight: 700,
          textTransform: "uppercase" as const, letterSpacing: "0.07em",
          color: active || failed ? "#fff" : "rgba(226,232,240,0.85)",
          margin: 0, lineHeight: 1.3,
        }}>{cfg.label}</p>
        <p style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: "8px",
          color: active || failed ? color : "rgba(148,163,184,0.6)",
          margin: "2px 0 0",
        }}>{cfg.sub}</p>
      </div>

      {/* Status */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "4px", paddingBottom: "9px" }}>
        <span style={{
          width: "5px", height: "5px", borderRadius: "50%",
          background: st.dot, boxShadow: st.glow, flexShrink: 0,
        }} />
        <span style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: "7.5px", fontWeight: 700,
          textTransform: "uppercase" as const, letterSpacing: "0.06em", color: st.dot,
        }}>{st.label}</span>
      </div>
    </div>
  );
}

/* ─────────── Diamond Gate ─────────── */
function DiamondGate({ label, status, color }: { label: string; status: StepStatus; color: string }) {
  const active = status === "running" || status === "completed";
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "76px", height: "76px" }}>
      <div
        className={status === "running" ? "pipeline-node-running" : undefined}
        style={{
          width: "62px", height: "62px", transform: "rotate(45deg)", borderRadius: "8px",
          border: `1.5px solid ${active ? color : "rgba(148,163,184,0.4)"}`,
          background: active ? `${color}22` : "rgba(20,22,40,0.9)",
          boxShadow: active ? `0 0 18px ${color}45` : "0 2px 10px rgba(0,0,0,0.5)",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all 0.3s ease",
        }}
      >
        <span style={{
          transform: "rotate(-45deg)",
          fontFamily: "'JetBrains Mono', monospace", fontSize: "8px", fontWeight: 700,
          textTransform: "uppercase" as const, letterSpacing: "0.05em",
          color: active ? color : "rgba(226,232,240,0.65)",
          whiteSpace: "nowrap" as const, textAlign: "center" as const,
          display: "block", lineHeight: 1.3,
        }}>{label}</span>
      </div>
    </div>
  );
}

/* ─────────── Arrows ─────────── */
function VArrow({ active, h = 30 }: { active?: boolean; h?: number }) {
  const c = arrowColor(!!active);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", height: `${h}px`, flexShrink: 0 }}>
      <div style={{ width: "2px", flex: 1, background: c }} />
      <svg width="12" height="7" viewBox="0 0 12 7" style={{ flexShrink: 0 }}>
        <path d="M6 7L0 0h12z" fill={c} />
      </svg>
    </div>
  );
}

function HArrow({ active, w = 24 }: { active?: boolean; w?: number }) {
  const c = arrowColor(!!active);
  return (
    <div style={{ display: "flex", alignItems: "center", width: `${w}px`, flexShrink: 0 }}>
      <div style={{ flex: 1, height: "2px", background: c }} />
      <svg width="7" height="12" viewBox="0 0 7 12" style={{ flexShrink: 0 }}>
        <path d="M7 6L0 0v12z" fill={c} />
      </svg>
    </div>
  );
}

function Tag({ text, color }: { text: string; color: string }) {
  return (
    <span style={{
      fontFamily: "'JetBrains Mono', monospace", fontSize: "8px", fontWeight: 700,
      textTransform: "uppercase" as const, letterSpacing: "0.08em",
      color, background: `${color}20`,
      border: `1.5px solid ${color}60`,
      borderRadius: "4px", padding: "1px 6px",
      flexShrink: 0,
    }}>{text}</span>
  );
}

/* ─────────── Main diagram ─────────── */
export default function PipelineFlowDiagram({ snapshot }: { snapshot: PipelineSnapshot }) {
  const { steps } = snapshot;
  const a = (s: StepStatus) => s === "running" || s === "completed";

  const CARD_W   = 160;   // main card width
  const SMALL_W  = 134;   // smaller card (courier, ship, hold)
  const GATE_W   = 76;    // gate diamond width

  return (
    <div style={{
      width: "100%", height: "100%", overflowY: "auto", overflowX: "hidden",
      display: "flex", justifyContent: "center", padding: "20px 8px",
    }} className="terminal-scroll">

      {/* Main column — all items center-aligned */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>

        {/* ── CODE PUSH ── */}
        <AgentCard stepId="code_push" status={steps.code_push} width={CARD_W} />
        <VArrow active={a(steps.architect)} />

        {/* ── ARCHITECT ── */}
        <AgentCard stepId="architect" status={steps.architect} width={CARD_W} />
        <VArrow active={a(steps.scripter)} />

        {/* ── SCRIPTER ── */}
        <AgentCard stepId="scripter" status={steps.scripter} width={CARD_W} />
        <VArrow active={a(steps.tests_gate)} />

        {/* ── TESTS GATE + YES→COURIER branch ──
            Use position:relative so gate stays centered at column midpoint,
            and Courier branch is absolutely placed to the right.           */}
        <div style={{ position: "relative", width: `${CARD_W}px`, height: `${GATE_W}px`, flexShrink: 0 }}>
          {/* Gate: centered in the 160px column */}
          <div style={{ position: "absolute", left: `${(CARD_W - GATE_W) / 2}px`, top: 0 }}>
            <DiamondGate label={"Tests\nPass?"} status={steps.tests_gate} color="#f59e0b" />
          </div>

          {/* YES → Courier: starts at right edge of gate (cx + 38px) */}
          <div style={{
            position: "absolute",
            left: `${CARD_W / 2 + GATE_W / 2}px`,   // right edge of gate
            top: "50%", transform: "translateY(-50%)",
            display: "flex", alignItems: "center", gap: 0,
          }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "3px" }}>
              <Tag text="YES" color="#4ade80" />
              <HArrow active={a(steps.courier)} w={22} />
            </div>
            <AgentCard stepId="courier" status={steps.courier} width={SMALL_W} />
          </div>
        </div>

        {/* NO label + arrow — centered in the column, below gate */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: `${CARD_W}px` }}>
          <div style={{ marginTop: "4px", marginBottom: "3px" }}>
            <Tag text="NO" color="#f87171" />
          </div>
          <VArrow active={a(steps.healer)} h={22} />
        </div>

        {/* ── HEALER ── */}
        <AgentCard stepId="healer" status={steps.healer} width={CARD_W} />
        <VArrow active={a(steps.confidence_gate)} />

        {/* ── CONFIDENCE GATE + SHIP/HOLD — single SVG fork connector ── */}
        {(() => {
          const branchW  = SMALL_W * 2 + 36;  // 304
          const shipCx   = SMALL_W / 2;        // 67  — centre of SHIP card
          const holdCx   = SMALL_W + 36 + SMALL_W / 2;  // 237 — centre of HOLD card
          const midX     = branchW / 2;        // 152 — aligns with gate centre
          const cAll     = arrowColor(a(steps.ship) || a(steps.block));
          const cShip    = arrowColor(a(steps.ship));
          const cHold    = arrowColor(a(steps.block));
          const SVG_H    = 68;
          const jY       = 28;   // Y of horizontal junction line
          const arrY     = 52;   // Y where arrow tip ends

          return (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              {/* Gate centred in the branchW container */}
              <div style={{ width: `${branchW}px`, display: "flex", justifyContent: "center" }}>
                <DiamondGate label={"Conf\n>80%?"} status={steps.confidence_gate} color="#a78bfa" />
              </div>

              {/* SVG fork */}
              <svg
                width={branchW} height={SVG_H}
                style={{ display: "block", overflow: "visible" }}
              >
                {/* Stem from gate bottom → junction */}
                <line x1={midX} y1={0} x2={midX} y2={jY}
                  stroke={cAll} strokeWidth="2" strokeLinecap="round" />

                {/* Horizontal bar */}
                <line x1={shipCx} y1={jY} x2={holdCx} y2={jY}
                  stroke={cAll} strokeWidth="2" strokeLinecap="round" />

                {/* Left branch: junction → arrowhead → SHIP */}
                <line x1={shipCx} y1={jY} x2={shipCx} y2={arrY}
                  stroke={cShip} strokeWidth="2" strokeLinecap="round" />
                <polygon
                  points={`${shipCx - 6},${arrY} ${shipCx + 6},${arrY} ${shipCx},${arrY + 9}`}
                  fill={cShip} />

                {/* Right branch: junction → arrowhead → HOLD */}
                <line x1={holdCx} y1={jY} x2={holdCx} y2={arrY}
                  stroke={cHold} strokeWidth="2" strokeLinecap="round" />
                <polygon
                  points={`${holdCx - 6},${arrY} ${holdCx + 6},${arrY} ${holdCx},${arrY + 9}`}
                  fill={cHold} />

                {/* >80% label above left branch */}
                <rect x={shipCx - 16} y={jY - 18} width={32} height={14} rx={4}
                  fill="#4ade8020" stroke="#4ade8055" strokeWidth="1" />
                <text x={shipCx} y={jY - 7} textAnchor="middle"
                  fontSize="7.5" fontFamily="JetBrains Mono,monospace" fontWeight="700"
                  fill="#4ade80" letterSpacing="0.5">
                  &gt;80%
                </text>

                {/* ≤80% label above right branch */}
                <rect x={holdCx - 16} y={jY - 18} width={32} height={14} rx={4}
                  fill="#f8717120" stroke="#f8717155" strokeWidth="1" />
                <text x={holdCx} y={jY - 7} textAnchor="middle"
                  fontSize="7.5" fontFamily="JetBrains Mono,monospace" fontWeight="700"
                  fill="#f87171" letterSpacing="0.5">
                  ≤80%
                </text>
              </svg>

              {/* SHIP + HOLD cards */}
              <div style={{ display: "flex", gap: "36px" }}>
                <AgentCard stepId="ship"  status={steps.ship}  width={SMALL_W} />
                <AgentCard stepId="block" status={steps.block} width={SMALL_W} />
              </div>
            </div>
          );
        })()}

        <div style={{ height: "16px" }} />
      </div>
    </div>
  );
}
