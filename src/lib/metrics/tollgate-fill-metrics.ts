/**
 * Static “fill” metrics mirrored on `/api/metrics/prometheus-bridge` for Grafana.
 * Live series come from the AI Engine; these names are only `tollgate_fill_*`.
 */

/** Upper bounds (seconds) — same ordering as the Metrics page histogram. */
export const PIPELINE_DURATION_BUCKET_UPPERS = [
  1, 5, 10, 30, 60, 120, 300, 600,
] as const;

/** Bar heights for the pipeline duration chart when the engine has no histogram (UI demo). */
export const DEMO_PIPELINE_DURATION_BARS = [
  1, 2.5, 5, 12, 18, 9, 4, 1.5, 0.5,
] as const;

/** Scripter / Courier when the engine does not emit `tollgate_agent_step_duration_*` for those agents. */
export const DEMO_AGENT_LATENCY_SEC: Readonly<Record<string, number>> = {
  scripter: 38,
  courier: 11,
};

function lePrometheus(upperSec: number): string {
  return Number.isInteger(upperSec) ? `${upperSec}.0` : String(upperSec);
}

/**
 * Prometheus text exposition fragment (no timestamps). Append after real `/metrics` from the AI Engine.
 */
export function buildHardcodedPrometheusBlock(): string {
  const lines: string[] = [
    "# HELP tollgate_fill_agent_step_seconds Static UI demo latencies for scripter and courier (seconds).",
    "# TYPE tollgate_fill_agent_step_seconds gauge",
  ];
  for (const [agent, sec] of Object.entries(DEMO_AGENT_LATENCY_SEC)) {
    lines.push(`tollgate_fill_agent_step_seconds{agent="${agent}"} ${sec}`);
  }

  if (DEMO_PIPELINE_DURATION_BARS.length !== PIPELINE_DURATION_BUCKET_UPPERS.length) {
    throw new Error("DEMO_PIPELINE_DURATION_BARS length must match PIPELINE_DURATION_BUCKET_UPPERS");
  }

  lines.push(
    "# HELP tollgate_fill_pipeline_duration_bar Demo bar height per histogram bucket (non-cumulative, for Grafana bar charts).",
    "# TYPE tollgate_fill_pipeline_duration_bar gauge",
  );
  for (let i = 0; i < DEMO_PIPELINE_DURATION_BARS.length; i++) {
      const le = lePrometheus(PIPELINE_DURATION_BUCKET_UPPERS[i]!);
      lines.push(
        `tollgate_fill_pipeline_duration_bar{le="${le}"} ${DEMO_PIPELINE_DURATION_BARS[i]}`,
      );
    }

  lines.push(
    "# HELP tollgate_fill_exporter_info Set to 1 when the Luminus bridge appended static fill metrics.",
    "# TYPE tollgate_fill_exporter_info gauge",
    'tollgate_fill_exporter_info{source="luminus-bridge"} 1',
  );

  return lines.join("\n");
}
