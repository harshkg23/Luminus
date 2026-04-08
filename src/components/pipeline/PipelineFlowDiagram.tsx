"use client";

import type { PipelineSnapshot, StepId, StepStatus } from "@/lib/pipeline/types";

type Edge = {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  toStep: StepId;
  label?: string;
  labelX?: number;
  labelY?: number;
};

const accent = "var(--accent)";
const pos = "var(--pos)";
const muted = "var(--fg-4)";

function nodeStroke(status: StepStatus): string {
  if (status === "failed") return "var(--neg)";
  if (status === "completed") return pos;
  if (status === "running") return accent;
  return "var(--bd-2)";
}

function nodeLabelColor(status: StepStatus): string {
  if (status === "failed") return "var(--neg)";
  if (status === "completed") return "var(--fg-1)";
  if (status === "running") return accent;
  return "var(--fg-3)";
}

function FlowNodeRect(props: {
  cx: number;
  cy: number;
  w: number;
  h: number;
  title: string;
  subtitle: string;
  status: StepStatus;
}) {
  const { cx, cy, w, h, title, subtitle, status } = props;
  const x = cx - w / 2;
  const y = cy - h / 2;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={10}
        fill="var(--bg-card)"
        stroke={nodeStroke(status)}
        strokeWidth={status === "running" ? 2.5 : 1.5}
        className={status === "running" ? "pipeline-node-running" : undefined}
      />
      <text
        x={cx}
        y={cy - 6}
        textAnchor="middle"
        className="font-mono text-[13px] font-bold uppercase tracking-wide"
        fill={nodeLabelColor(status)}
      >
        {title}
      </text>
      <text x={cx} y={cy + 12} textAnchor="middle" className="font-mono text-[11px]" fill="var(--fg-3)">
        {subtitle}
      </text>
    </g>
  );
}

function FlowDiamond(props: {
  cx: number;
  cy: number;
  size: number;
  title: string;
  status: StepStatus;
}) {
  const { cx, cy, size, title, status } = props;
  const s = size / 2;
  const points = `${cx},${cy - s} ${cx + s},${cy} ${cx},${cy + s} ${cx - s},${cy}`;
  return (
    <g>
      <polygon
        points={points}
        fill="var(--bg-elevated)"
        stroke={nodeStroke(status)}
        strokeWidth={status === "running" ? 2.5 : 1.5}
        className={status === "running" ? "pipeline-node-running" : undefined}
      />
      <text x={cx} y={cy + 4} textAnchor="middle" className="font-mono text-[12px] font-bold" fill={nodeLabelColor(status)}>
        {title}
      </text>
    </g>
  );
}

export default function PipelineFlowDiagram({ snapshot }: { snapshot: PipelineSnapshot }) {
  const { steps } = snapshot;

  const edges: Edge[] = [
    { id: "e1", x1: 180, y1: 62, x2: 180, y2: 72, toStep: "architect" },
    { id: "e2", x1: 180, y1: 124, x2: 180, y2: 136, toStep: "scripter" },
    { id: "e3", x1: 180, y1: 188, x2: 180, y2: 207, toStep: "tests_gate" },
    {
      id: "e4",
      x1: 212,
      y1: 236,
      x2: 250,
      y2: 236,
      toStep: "courier",
      label: "YES",
      labelX: 226,
      labelY: 224,
    },
    {
      id: "e5",
      x1: 180,
      y1: 265,
      x2: 180,
      y2: 296,
      toStep: "watchdog",
      label: "NO",
      labelX: 194,
      labelY: 278,
    },
    { id: "e6", x1: 180, y1: 348, x2: 180, y2: 382, toStep: "healer" },
    { id: "e7", x1: 180, y1: 434, x2: 180, y2: 455, toStep: "confidence_gate" },
    {
      id: "e8",
      x1: 180,
      y1: 517,
      x2: 118,
      y2: 516,
      toStep: "ship",
      label: ">80%",
      labelX: 128,
      labelY: 500,
    },
    {
      id: "e9",
      x1: 180,
      y1: 517,
      x2: 258,
      y2: 516,
      toStep: "block",
      label: "≤80%",
      labelX: 232,
      labelY: 500,
    },
  ];

  return (
    <div className="w-full h-full min-h-0 flex items-center justify-center overflow-hidden">
      <svg
        viewBox="-20 -16 400 552"
        className="w-full h-full max-h-[920px] lg:max-h-none"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Agent pipeline flow"
      >
        <defs>
          <marker id="arrowhead" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">
            <path d="M 0 0 L 10 4 L 0 8 Z" fill={muted} className="pipeline-arrow-fill" />
          </marker>
          <marker id="arrowhead-glow" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">
            <path d="M 0 0 L 10 4 L 0 8 Z" fill={accent} />
          </marker>
        </defs>

        {edges.map((e) => {
          const done = steps[e.toStep] === "completed";
          const stroke = done ? accent : muted;
          const strokeW = done ? 3.2 : 1.8;
          return (
            <g key={e.id}>
              <line
                x1={e.x1}
                y1={e.y1}
                x2={e.x2}
                y2={e.y2}
                stroke={stroke}
                strokeWidth={strokeW}
                strokeLinecap="round"
                markerEnd={done ? "url(#arrowhead-glow)" : "url(#arrowhead)"}
                className={done ? "pipeline-edge-glow" : undefined}
              />
              {e.label && (
                <text x={e.labelX} y={e.labelY} className="font-mono text-[10px] fill-fg-4 uppercase">
                  {e.label}
                </text>
              )}
            </g>
          );
        })}

        <FlowNodeRect cx={180} cy={36} w={168} h={52} title="Code push" subtitle="Trigger" status={steps.code_push} />
        <FlowNodeRect
          cx={180}
          cy={98}
          w={170}
          h={52}
          title="The Architect"
          subtitle="Planner"
          status={steps.architect}
        />
        <FlowNodeRect
          cx={180}
          cy={162}
          w={174}
          h={52}
          title="The Scripter"
          subtitle="Playwright MCP"
          status={steps.scripter}
        />
        <FlowDiamond cx={180} cy={236} size={58} title="Tests?" status={steps.tests_gate} />
        <FlowNodeRect cx={314} cy={236} w={124} h={52} title="Courier" subtitle="Slack" status={steps.courier} />
        <FlowNodeRect
          cx={180}
          cy={322}
          w={170}
          h={52}
          title="The Watchdog"
          subtitle="SRE"
          status={steps.watchdog}
        />
        <FlowNodeRect cx={180} cy={408} w={170} h={52} title="The Healer" subtitle="Debugger" status={steps.healer} />
        <FlowDiamond cx={180} cy={486} size={62} title="Conf.?" status={steps.confidence_gate} />

        <FlowNodeRect cx={118} cy={538} w={102} h={44} title="Ship" subtitle="GitHub" status={steps.ship} />
        <FlowNodeRect cx={258} cy={538} w={102} h={44} title="Hold" subtitle="Escalate" status={steps.block} />
      </svg>
    </div>
  );
}
