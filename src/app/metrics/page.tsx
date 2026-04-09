"use client";

import { useEffect, useRef, useState } from "react";
import TopBar from "@/components/TopBar";

/* ═══════════════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════════════ */

interface MetricSample {
  labels: Record<string, string>;
  value: number;
}
interface MetricEntry {
  name: string;
  samples: MetricSample[];
}
type MetricsMap = Record<string, MetricEntry>;

/* ═══════════════════════════════════════════════════════════════════════════
   Config
   ═══════════════════════════════════════════════════════════════════════════ */

const POLL_MS = 10_000;
const MAX_SPARK = 30;
const GRAFANA_URL = "http://localhost:3001";

/** When `tollgate_pipeline_duration_seconds_bucket` has no data yet, show this illustrative shape (same bucket count as `BUCKETS` below). */
const DEMO_PIPELINE_DURATION_BARS = [1, 2.5, 5, 12, 18, 9, 4, 1.5, 0.5];
/** Fallback agent latencies (seconds) when Prometheus has no `agent` step samples (Next.js flow often omits scripter/courier). */
const DEMO_AGENT_LATENCY_SEC: Record<string, number> = {
  scripter: 38,
  courier: 11,
};

/* ═══════════════════════════════════════════════════════════════════════════
   Pure helpers
   ═══════════════════════════════════════════════════════════════════════════ */

function mv(m: MetricsMap, name: string, labels?: Record<string, string>): number {
  const entry = m[name];
  if (!entry) return 0;
  if (!labels) return entry.samples[0]?.value ?? 0;
  const s = entry.samples.find((sample) =>
    Object.entries(labels).every(([k, v]) => sample.labels[k] === v),
  );
  return s?.value ?? 0;
}

function msum(m: MetricsMap, name: string): number {
  const entry = m[name];
  if (!entry) return 0;
  return entry.samples.reduce((a, b) => a + b.value, 0);
}

function fmt(n: number, d = 1): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(d)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(d)}k`;
  return n.toFixed(d);
}

function fmtDur(sec: number): string {
  if (sec < 0.001) return "—";
  if (sec < 1) return `${(sec * 1000).toFixed(0)}ms`;
  if (sec < 60) return `${sec.toFixed(1)}s`;
  return `${(sec / 60).toFixed(1)}m`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Sparkline
   ═══════════════════════════════════════════════════════════════════════════ */

function Sparkline({ data, color = "var(--accent)", w = 90, h = 30 }: {
  data: number[]; color?: string; w?: number; h?: number;
}) {
  if (data.length < 2) return <div style={{ width: w, height: h }} />;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const pts = data
    .map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * (h - 4) - 2}`)
    .join(" ");
  const gid = `sp${color.replace(/\W/g, "")}`;
  return (
    <svg width={w} height={h} className="shrink-0">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline fill="none" stroke={color} strokeWidth="1.5" points={pts} />
      <polygon fill={`url(#${gid})`} points={`0,${h} ${pts} ${w},${h}`} />
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   StatCard
   ═══════════════════════════════════════════════════════════════════════════ */

function StatCard({ label, value, sub, subColor, icon, spark, sparkColor }: {
  label: string; value: string; sub: string; subColor?: string;
  icon: string; spark?: number[]; sparkColor?: string;
}) {
  return (
    <div className="glass-panel p-5 rounded-xl flex flex-col justify-between min-h-[120px]">
      <div className="flex justify-between items-start">
        <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: "var(--fg-4)" }}>{label}</span>
        <span className="material-symbols-outlined" style={{ fontSize: 18, color: "var(--accent)" }}>{icon}</span>
      </div>
      <div className="flex items-end justify-between gap-3 mt-2">
        <div>
          <span className="text-3xl font-headline font-bold" style={{ color: "var(--fg-1)" }}>{value}</span>
          <span className="ml-2 font-mono text-[10px]" style={{ color: subColor || "var(--fg-3)" }}>{sub}</span>
        </div>
        {spark && spark.length > 1 && <Sparkline data={spark} color={sparkColor} />}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   BarChart
   ═══════════════════════════════════════════════════════════════════════════ */

function BarChart({ data, labels, color = "var(--accent)", h = 180 }: {
  data: number[]; labels?: string[]; color?: string; h?: number;
}) {
  const max = Math.max(...data, 1e-9);
  /** Reserve space for x-axis labels so bar heights use pixel math (percent heights broke inside flex columns). */
  const labelBand = 20;
  const plotH = Math.max(h - labelBand, 40);

  return (
    <div className="flex gap-1.5 w-full items-stretch" style={{ height: h }}>
      {data.map((v, i) => {
        const barPx = Math.max((v / max) * plotH, v > 0 ? 4 : 0);
        return (
          <div
            key={i}
            className="flex-1 flex flex-col justify-end items-stretch min-w-0 group relative"
            style={{ height: h }}
          >
            <div className="relative w-full flex flex-col justify-end flex-1 min-h-0">
              <div
                className="w-full rounded-t-sm transition-all hover:opacity-90 cursor-pointer relative shrink-0"
                style={{
                  height: barPx,
                  background: `color-mix(in srgb, ${color} 28%, transparent)`,
                  borderBottom: `2px solid ${color}`,
                }}
              >
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity rounded px-1.5 py-0.5 text-[9px] font-mono whitespace-nowrap z-10 pointer-events-none"
                  style={{ background: "var(--bg-elevated)", border: "1px solid var(--bd)", color: "var(--fg-2)" }}>
                  {v.toFixed(1)}
                </div>
              </div>
            </div>
            {labels?.[i] ? (
              <span className="text-[8px] font-mono text-center leading-tight pt-1 truncate w-full" style={{ color: "var(--fg-4)" }}>
                {labels[i]}
              </span>
            ) : (
              <span className="pt-1" style={{ height: labelBand }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   AgentLatency
   ═══════════════════════════════════════════════════════════════════════════ */

function AgentLatency({ m }: { m: MetricsMap }) {
  const agents = ["architect", "scripter", "healer", "courier"];
  return (
    <div className="glass-panel rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b flex items-center gap-2" style={{ borderColor: "var(--bd)" }}>
        <span className="material-symbols-outlined" style={{ fontSize: 16, color: "var(--accent)" }}>alt_route</span>
        <span className="text-sm font-headline font-semibold" style={{ color: "var(--fg-1)" }}>Agent Step Latency</span>
      </div>
      <div className="p-5 space-y-4">
        {agents.map((a) => {
          const count = mv(m, "tollgate_agent_step_duration_seconds_count", { agent: a });
          const sum = mv(m, "tollgate_agent_step_duration_seconds_sum", { agent: a });
          const demoSec = DEMO_AGENT_LATENCY_SEC[a];
          const hasProm = count > 0;
          const useDemoFallback = !hasProm && demoSec !== undefined;
          const avg = hasProm ? sum / count : useDemoFallback ? demoSec : 0;
          const pct = Math.min((avg / 60) * 100, 100);
          const barColor = avg > 30 ? "var(--warn)" : "var(--accent)";
          return (
            <div key={a} className="space-y-1.5">
              <div className="flex justify-between items-center gap-2 font-mono text-[11px]">
                <span style={{ color: "var(--fg-3)" }} className="capitalize">{a}</span>
                <span className="flex items-center gap-1.5">
                  {useDemoFallback ? (
                    <span className="font-mono text-[8px] uppercase tracking-wider px-1 py-px rounded" style={{ color: "var(--fg-4)", border: "1px solid var(--bd)" }}>
                      demo
                    </span>
                  ) : null}
                  <span style={{ color: barColor }} className="font-bold">
                    {hasProm || useDemoFallback ? fmtDur(avg) : "—"}
                  </span>
                </span>
              </div>
              <div className="w-full rounded-full h-1 overflow-hidden" style={{ background: "var(--bg-elevated)" }}>
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${hasProm || useDemoFallback ? pct : 0}%`, background: barColor }} />
              </div>
            </div>
          );
        })}
        <div className="pt-3 mt-2 border-t flex flex-col gap-1 font-mono text-[10px] uppercase tracking-widest"
          style={{ borderColor: "var(--bd)", color: "var(--fg-4)" }}>
          <div className="flex items-center justify-between w-full">
            <span>Source</span>
            <span className="font-bold" style={{ color: "var(--fg-1)" }}>Prometheus</span>
          </div>
          <p className="normal-case tracking-normal text-[9px] leading-snug" style={{ color: "var(--fg-4)" }}>
            Scripter &amp; Courier show demo latency when the engine has not emitted step metrics for those agents.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   ApiRequests
   ═══════════════════════════════════════════════════════════════════════════ */

function ApiRequests({ m }: { m: MetricsMap }) {
  const entry = m["tollgate_api_requests_total"];
  const byEp: Record<string, number> = {};
  if (entry) {
    for (const s of entry.samples) {
      const ep = s.labels.endpoint || "unknown";
      byEp[ep] = (byEp[ep] || 0) + s.value;
    }
  }
  const sorted = Object.entries(byEp).sort(([, a], [, b]) => b - a).slice(0, 8);
  const total = sorted.reduce((a, [, v]) => a + v, 0);

  return (
    <div className="glass-panel p-5 rounded-xl">
      <div className="flex items-center gap-2 mb-5">
        <span className="material-symbols-outlined" style={{ fontSize: 16, color: "var(--accent)" }}>api</span>
        <span className="text-sm font-headline font-semibold" style={{ color: "var(--fg-1)" }}>API Request Distribution</span>
      </div>
      {sorted.length === 0 ? (
        <p className="font-mono text-[10px] italic" style={{ color: "var(--fg-4)" }}>No API requests recorded yet.</p>
      ) : (
        <div className="space-y-3">
          {sorted.map(([ep, count]) => (
            <div key={ep} className="space-y-1">
              <div className="flex justify-between font-mono text-[10px]">
                <span style={{ color: "var(--fg-3)" }} className="truncate max-w-[200px]">{ep}</span>
                <span style={{ color: "var(--fg-2)" }}>{count.toFixed(0)}</span>
              </div>
              <div className="w-full rounded-full h-1 overflow-hidden" style={{ background: "var(--bg-elevated)" }}>
                <div className="h-full rounded-full" style={{ width: `${total > 0 ? (count / total) * 100 : 0}%`, background: "var(--data)" }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   GrafanaEmbed
   ═══════════════════════════════════════════════════════════════════════════ */

function GrafanaEmbed() {
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    // Check if Grafana is reachable (any response = available)
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    fetch(`${GRAFANA_URL}/api/health`, { signal: controller.signal, mode: "no-cors" })
      .then(() => setAvailable(true))
      .catch(() => setAvailable(false))
      .finally(() => clearTimeout(timer));
    return () => { controller.abort(); clearTimeout(timer); };
  }, []);

  return (
    <div className="glass-panel rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: "var(--bd)" }}>
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined" style={{ fontSize: 16, color: "var(--vi)" }}>monitoring</span>
          <span className="text-sm font-headline font-semibold" style={{ color: "var(--fg-1)" }}>Grafana Dashboard</span>
        </div>
        <div className="flex items-center gap-2">
          {available === false && (
            <span className="font-mono text-[9px] px-2 py-0.5 rounded-full border uppercase tracking-widest"
              style={{ color: "var(--warn)", borderColor: "color-mix(in srgb, var(--warn) 30%, transparent)", background: "color-mix(in srgb, var(--warn) 8%, transparent)" }}>
              Grafana Offline
            </span>
          )}
          <a href={GRAFANA_URL} target="_blank" rel="noreferrer"
            className="font-mono text-[10px] uppercase tracking-widest flex items-center gap-1 transition-colors"
            style={{ color: "var(--accent)" }}>
            Open <span className="material-symbols-outlined" style={{ fontSize: 14 }}>open_in_new</span>
          </a>
        </div>
      </div>

      {available ? (
        <iframe
          src={`${GRAFANA_URL}/?orgId=1&theme=dark&kiosk&refresh=5s`}
          width="100%" height={500} frameBorder="0"
          className="bg-transparent" loading="lazy" style={{ border: "none" }}
        />
      ) : (
        <div className="flex flex-col items-center justify-center gap-3 py-16" style={{ color: "var(--fg-4)" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 48, opacity: 0.2 }}>monitoring</span>
          <p className="font-mono text-[11px] text-center max-w-sm">
            Grafana is not detected at <code className="text-[10px]" style={{ color: "var(--data)" }}>{GRAFANA_URL}</code>
          </p>
          <div className="font-mono text-[9px] text-center max-w-md space-y-1 mt-2"
            style={{ color: "var(--fg-4)" }}>
            <p className="font-semibold" style={{ color: "var(--fg-3)" }}>To enable Grafana dashboards:</p>
            <code className="block px-3 py-2 rounded-lg text-left" style={{ background: "var(--bg-elevated)" }}>
              cd monitoring{"\n"}docker compose up -d
            </code>
            <p className="mt-2">Prometheus metrics are still shown natively above ↑</p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Sparkline key config — typed explicitly to fix TS error
   ═══════════════════════════════════════════════════════════════════════════ */

interface SparkKey {
  name: string;
  labels: Record<string, string> | undefined;
  key: string;
}

const SPARK_KEYS: SparkKey[] = [
  { name: "tollgate_pipeline_runs_total", labels: { status: "completed" }, key: "p_ok" },
  { name: "tollgate_tests_total", labels: { result: "passed" }, key: "t_pass" },
  { name: "tollgate_pipeline_duration_seconds_sum", labels: undefined, key: "p_dur" },
  { name: "tollgate_healer_confidence_score", labels: undefined, key: "h_conf" },
];

/* ═══════════════════════════════════════════════════════════════════════════
   Page State
   ═══════════════════════════════════════════════════════════════════════════ */

interface PageState {
  metrics: MetricsMap;
  online: boolean | null;
  updatedAt: string;
  sparks: Record<string, number[]>;
}

const INITIAL: PageState = { metrics: {}, online: null, updatedAt: "", sparks: {} };

/* ═══════════════════════════════════════════════════════════════════════════
   MetricsPage
   ═══════════════════════════════════════════════════════════════════════════ */

export default function MetricsPage() {
  const [s, setS] = useState<PageState>(INITIAL);
  const [tab, setTab] = useState<"prometheus" | "grafana">("prometheus");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  /* ─── Poller ─── */
  useEffect(() => {
    mountedRef.current = true;

    async function poll() {
      try {
        const res = await fetch("/api/prometheus");
        const data = await res.json();
        if (!mountedRef.current) return;

        if (data.status === "success" && data.metrics) {
          setS((prev) => {
            const newSparks = { ...prev.sparks };
            for (const sk of SPARK_KEYS) {
              const val = mv(data.metrics, sk.name, sk.labels);
              const arr = newSparks[sk.key] || [];
              newSparks[sk.key] = [...arr.slice(-(MAX_SPARK - 1)), val];
            }
            return { metrics: data.metrics, online: true, updatedAt: new Date().toLocaleTimeString(), sparks: newSparks };
          });
        } else {
          setS((prev) => prev.online === false ? prev : { ...prev, online: false });
        }
      } catch {
        setS((prev) => prev.online === false ? prev : { ...prev, online: false });
      }

      if (mountedRef.current) {
        timerRef.current = setTimeout(poll, POLL_MS);
      }
    }

    timerRef.current = setTimeout(poll, 800);
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  /* ─── Derived values ─── */
  const m = s.metrics;
  const pOk = mv(m, "tollgate_pipeline_runs_total", { status: "completed" });
  const pFail = mv(m, "tollgate_pipeline_runs_total", { status: "failed" });
  const pTotal = pOk + pFail;
  const active = mv(m, "tollgate_active_pipelines");
  const tPass = mv(m, "tollgate_tests_total", { result: "passed" });
  const tFail = mv(m, "tollgate_tests_total", { result: "failed" });
  const tTotal = tPass + tFail;
  const passRate = tTotal > 0 ? ((tPass / tTotal) * 100).toFixed(1) : "—";
  const hConf = mv(m, "tollgate_healer_confidence_score");
  const hTotal = msum(m, "tollgate_healer_runs_total");
  const pDurCount = mv(m, "tollgate_pipeline_duration_seconds_count");
  const pDurSum = mv(m, "tollgate_pipeline_duration_seconds_sum");
  const avgDur = pDurCount > 0 ? pDurSum / pDurCount : 0;
  const apiTotal = msum(m, "tollgate_api_requests_total");

  /* histogram */
  const BUCKETS = [1, 5, 10, 30, 60, 120, 300, 600];
  const bucketLabels = BUCKETS.map((b) => (b < 60 ? `${b}s` : `${b / 60}m`));
  const bucketData = BUCKETS.map((b) =>
    mv(m, "tollgate_pipeline_duration_seconds_bucket", { le: b % 1 === 0 ? `${b}.0` : String(b) }),
  );
  const diffData = bucketData.map((v, i) => (i === 0 ? v : Math.max(0, v - bucketData[i - 1])));
  const hasHistogram = diffData.some((v) => v > 0);
  const histogramBars = hasHistogram ? diffData : DEMO_PIPELINE_DURATION_BARS;

  /* metric count */
  const metricCount = Object.keys(m).length;

  /* ═══════════════ RENDER ═══════════════ */
  return (
    <>
      <TopBar activeLabel="Observability" />

      <main className="p-8 space-y-8 max-w-[1600px]">
        {/* ── Header ── */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
          <div className="space-y-1">
            <h1 className="text-4xl font-headline font-bold tracking-tight" style={{ color: "var(--fg-1)" }}>
              System Metrics
            </h1>
            <p className="font-mono text-[11px] uppercase tracking-widest" style={{ color: "var(--fg-4)" }}>
              Prometheus · Real-time Agent Observability
            </p>
          </div>

          <div className="flex gap-3 items-center flex-wrap">
            {/* Connection pill */}
            <div className="glass-panel px-4 py-2 rounded-lg flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{
                background: s.online === null ? "var(--warn)" : s.online ? "var(--pos)" : "var(--neg)",
              }} />
              <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "var(--fg-3)" }}>
                {s.online === null ? "Connecting…" : s.online ? "AI Engine Online" : "AI Engine Offline"}
              </span>
            </div>

            {/* Last updated */}
            {s.updatedAt && (
              <div className="glass-panel px-4 py-2 rounded-lg">
                <span className="font-mono text-[10px]" style={{ color: "var(--fg-4)" }}>
                  Updated: <span style={{ color: "var(--accent)" }}>{s.updatedAt}</span>
                </span>
              </div>
            )}

            {/* Tab toggle */}
            <div className="glass-panel rounded-lg flex overflow-hidden">
              <button onClick={() => setTab("prometheus")}
                className="px-3 py-2 font-mono text-[10px] uppercase tracking-widest transition-colors"
                style={{ color: tab === "prometheus" ? "var(--accent)" : "var(--fg-4)", background: tab === "prometheus" ? "var(--accent-soft)" : "transparent" }}>
                Prometheus
              </button>
              <button onClick={() => setTab("grafana")}
                className="px-3 py-2 font-mono text-[10px] uppercase tracking-widest transition-colors"
                style={{ color: tab === "grafana" ? "var(--vi)" : "var(--fg-4)", background: tab === "grafana" ? "var(--vi-soft)" : "transparent" }}>
                Grafana
              </button>
            </div>
          </div>
        </header>

        {tab === "grafana" ? (
          /* ═══ Grafana Tab ═══ */
          <GrafanaEmbed />
        ) : (
          /* ═══ Prometheus Tab ═══ */
          <div className="space-y-6">
            {/* Stat cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              <StatCard label="Pipeline Runs" value={pTotal.toFixed(0)}
                sub={`${pOk.toFixed(0)} ok · ${pFail.toFixed(0)} failed`}
                subColor={pFail > 0 ? "var(--neg)" : "var(--pos)"} icon="route"
                spark={s.sparks.p_ok} sparkColor="var(--pos)" />
              <StatCard label="Test Pass Rate" value={passRate === "—" ? "—" : `${passRate}%`}
                sub={`${tPass.toFixed(0)} / ${tTotal.toFixed(0)} tests`}
                subColor="var(--data)" icon="check_circle"
                spark={s.sparks.t_pass} sparkColor="var(--pos)" />
              <StatCard label="Avg Pipeline Duration" value={avgDur > 0 ? fmtDur(avgDur) : "—"}
                sub={active > 0 ? `${active} active` : "Idle"}
                subColor={active > 0 ? "var(--warn)" : "var(--fg-4)"} icon="timer"
                spark={s.sparks.p_dur} sparkColor="var(--accent)" />
              <StatCard label="Healer Confidence" value={hConf > 0 ? `${(hConf * 100).toFixed(1)}%` : "—"}
                sub={`${hTotal.toFixed(0)} invocations`}
                subColor="var(--vi)" icon="psychology"
                spark={s.sparks.h_conf} sparkColor="var(--vi)" />
            </div>

            {/* Chart + Latency */}
            <div className="grid grid-cols-12 gap-6">
              <section className="col-span-12 lg:col-span-8 glass-panel p-6 rounded-xl">
                <div className="flex justify-between items-center mb-6 flex-wrap gap-2">
                  <h2 className="font-headline text-base font-semibold flex items-center gap-2" style={{ color: "var(--fg-1)" }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: "var(--accent)" }}>query_stats</span>
                    Pipeline Duration Distribution
                  </h2>
                  {!hasHistogram ? (
                    <span className="font-mono text-[8px] uppercase tracking-wider px-2 py-1 rounded" style={{ color: "var(--fg-4)", border: "1px solid var(--bd)" }}>
                      demo preview
                    </span>
                  ) : null}
                </div>
                <BarChart data={histogramBars} labels={bucketLabels} color="var(--accent)" h={220} />
                {!hasHistogram ? (
                  <p className="font-mono text-[9px] mt-3" style={{ color: "var(--fg-4)" }}>
                    Illustrative shape until live histogram buckets populate (e.g. after <code className="text-fg-3">pipeline_duration_ms</code> on <code className="text-fg-3">/store-fix</code>).
                  </p>
                ) : null}
              </section>
              <div className="col-span-12 lg:col-span-4">
                <AgentLatency m={m} />
              </div>
            </div>

            {/* API Requests + Process Metrics */}
            <div className="grid grid-cols-12 gap-6">
              <div className="col-span-12 lg:col-span-6">
                <ApiRequests m={m} />
              </div>
              <div className="col-span-12 lg:col-span-6">
                <div className="glass-panel p-5 rounded-xl">
                  <div className="flex items-center gap-2 mb-5">
                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: "var(--data)" }}>memory</span>
                    <span className="text-sm font-headline font-semibold" style={{ color: "var(--fg-1)" }}>Process Metrics</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { label: "API Requests", val: fmt(apiTotal, 0), icon: "http", c: "var(--data)" },
                      { label: "RAG Queries", val: fmt(msum(m, "tollgate_rag_queries_total"), 0), icon: "search", c: "var(--vi)" },
                      { label: "Tests Executed", val: fmt(tTotal, 0), icon: "science", c: "var(--pos)" },
                      { label: "Failed Tests", val: fmt(tFail, 0), icon: "error", c: "var(--neg)" },
                    ].map(({ label, val, icon, c }) => (
                      <div key={label} className="p-4 rounded-xl border flex flex-col gap-2"
                        style={{ borderColor: "var(--bd)", background: "var(--bg-elevated)" }}>
                        <div className="flex justify-between items-start">
                          <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: "var(--fg-4)" }}>{label}</span>
                          <span className="material-symbols-outlined" style={{ fontSize: 16, color: c }}>{icon}</span>
                        </div>
                        <span className="text-2xl font-headline font-bold" style={{ color: "var(--fg-1)" }}>{val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Info banner */}
            <div className="glass-panel p-5 rounded-xl border-l-2 flex flex-col md:flex-row items-start md:items-center gap-4"
              style={{ borderLeftColor: "var(--accent)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 24, color: "var(--accent)" }}>info</span>
              <div className="flex-1">
                <p className="text-sm font-semibold" style={{ color: "var(--fg-1)" }}>Prometheus Endpoint Active</p>
                <p className="font-mono text-[10px] mt-1" style={{ color: "var(--fg-3)" }}>
                  Scrape:{" "}
                  <code className="px-1.5 py-0.5 rounded" style={{ background: "var(--bg-elevated)", color: "var(--data)" }}>
                    http://localhost:8000/metrics
                  </code>
                  {" · "}Polling {POLL_MS / 1000}s · {metricCount} families loaded
                </p>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
