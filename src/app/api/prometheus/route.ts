/**
 * GET /api/prometheus
 *
 * Proxies Prometheus metrics from the AI Engine (FastAPI).
 * • Returns structured JSON so the frontend can render charts.
 * • Includes a 4-second AbortController timeout to avoid hanging
 *   the Next.js event loop when the engine is unreachable.
 * • Always returns 200 with a `status` field so the client
 *   never hits an unexpected HTTP error or JSON parse failure.
 */

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const AI_ENGINE = process.env.AI_ENGINE_URL?.trim() || "http://localhost:8000";
const FETCH_TIMEOUT_MS = 4_000;

export async function GET(_request: NextRequest) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const res = await fetch(`${AI_ENGINE}/metrics`, {
      signal: controller.signal,
      cache: "no-store",
      // Next.js extends fetch — disable built-in revalidation
      next: { revalidate: 0 },
    } as RequestInit);

    clearTimeout(timer);

    if (!res.ok) {
      return NextResponse.json({
        status: "error",
        error: `AI Engine returned HTTP ${res.status}`,
        metrics: {},
      });
    }

    const text = await res.text();
    const metrics = parsePrometheusText(text);

    return NextResponse.json({ status: "success", metrics });
  } catch (err: unknown) {
    // Connection refused / timeout / network error — return gracefully
    const isAbort =
      err instanceof DOMException && err.name === "AbortError";
    const msg = isAbort
      ? "AI Engine request timed out"
      : err instanceof Error
        ? err.message
        : "Failed to reach AI Engine";

    return NextResponse.json({
      status: "error",
      error: msg,
      metrics: {},
    });
    // NOTE: intentionally returning 200 so fetch().json() never fails
    // on the client side. The `status` field tells the UI what happened.
  }
}

// ─── Parser ─────────────────────────────────────────────────────────────────

interface MetricSample {
  labels: Record<string, string>;
  value: number;
}
interface MetricEntry {
  name: string;
  samples: MetricSample[];
}

/**
 * Parse Prometheus exposition-format text into a structured object.
 *
 * Handles:
 *   metric_name 42
 *   metric_name{label="val",label2="val2"} 42
 */
function parsePrometheusText(text: string): Record<string, MetricEntry> {
  const result: Record<string, MetricEntry> = {};

  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#")) continue;

    // Try to match:  name{labels} value   OR   name value
    const m = line.match(
      /^([a-zA-Z_:][a-zA-Z0-9_:]*)\{([^}]*)\}\s+([^\s]+)/,
    );
    const m2 = !m
      ? line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)\s+([^\s]+)/)
      : null;

    let name: string;
    let labelsRaw: string | undefined;
    let valueStr: string;

    if (m) {
      [, name, labelsRaw, valueStr] = m;
    } else if (m2) {
      [, name, valueStr] = m2;
    } else {
      continue;
    }

    const value = parseFloat(valueStr);
    if (!isFinite(value)) continue;

    const labels: Record<string, string> = {};
    if (labelsRaw) {
      // Parse  key="value",key2="value2"
      const re = /(\w+)="([^"]*)"/g;
      let lm: RegExpExecArray | null;
      while ((lm = re.exec(labelsRaw)) !== null) {
        labels[lm[1]] = lm[2];
      }
    }

    if (!result[name]) {
      result[name] = { name, samples: [] };
    }
    result[name].samples.push({ labels, value });
  }
  return result;
}
