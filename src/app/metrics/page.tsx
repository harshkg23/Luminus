import TopBar from "@/components/TopBar";

const chartBars = [40, 55, 45, 80, 70, 60, 30, 90, 65, 50, 45, 40, 35];

const services = [
  { name: "API Gateway", latency: "12ms",  pct: 15, highlight: false },
  { name: "Auth Service", latency: "45ms", pct: 40, highlight: false },
  { name: "AI Inference", latency: "210ms",pct: 85, highlight: true  },
  { name: "DB Cluster",   latency: "18ms", pct: 22, highlight: false },
];

const errorLogs = [
  { time: "13:42:01.04", service: "Auth-Svc",   level: "CRITICAL", cls: "bg-neg/15 text-neg",              desc: "Handshake timeout on internal TLS 1.3 listener",  trace: "#882-ef31" },
  { time: "13:41:58.22", service: "AI-Node-04", level: "WARNING",  cls: "bg-warn/15 text-warn",            desc: "VRAM saturation exceeded threshold (94%)",          trace: "#901-ac88" },
  { time: "13:41:55.11", service: "DB-Main",    level: "INFO",     cls: "bg-[var(--bg-elevated)] text-fg-3", desc: "Replica lag recovered to < 50ms",                 trace: "#044-db2a" },
];

const bottomStats = [
  { label: "CPU LOAD", value: "34%",     delta: "-2.4%",  dc: "text-pos",  icon: "memory"    },
  { label: "MEM USE",  value: "8.4GB",   delta: "+0.1%",  dc: "text-warn", icon: "database"  },
  { label: "NET IN",   value: "1.2GB/s", delta: "Stable", dc: "text-data", icon: "download"  },
  { label: "NET OUT",  value: "842MB/s", delta: "+12.2%", dc: "text-data", icon: "upload"    },
];

export default function MetricsPage() {
  return (
    <>
      <TopBar activeLabel="System Metrics" />

      <main className="p-8 space-y-8 max-w-[1600px]">
        <header className="flex justify-between items-end">
          <div className="space-y-1">
            <h1 className="text-4xl font-headline font-bold tracking-tight text-fg-1">System Metrics</h1>
            <p className="font-mono text-[11px] text-fg-4 uppercase tracking-widest">
              Observability · regional cluster-01-prod
            </p>
          </div>
          <div className="flex gap-3 font-mono text-[11px]">
            <div className="glass-panel px-4 py-2 rounded-lg">
              <span className="text-fg-3">UPTIME:</span>
              <span className="text-accent font-bold ml-2">99.982%</span>
            </div>
            <div className="glass-panel px-4 py-2 rounded-lg">
              <span className="text-fg-3">REQ/S:</span>
              <span className="text-accent font-bold ml-2">12.4k</span>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-12 gap-6">

          {/* Resource Saturation Chart */}
          <section className="col-span-12 lg:col-span-8 glass-panel p-6 rounded-xl">
            <div className="flex justify-between items-center mb-8">
              <h2 className="font-headline text-base font-semibold flex items-center gap-2 text-fg-1">
                <span className="material-symbols-outlined text-accent" style={{ fontSize: "18px" }}>query_stats</span>
                Resource Saturation & Throughput
              </h2>
              <div className="flex gap-1.5">
                {["1H", "6H", "24H"].map((t, i) => (
                  <button key={t} className={`font-mono text-[10px] px-3 py-1 rounded-lg uppercase tracking-widest transition-colors ${i === 0 ? "bg-[var(--accent-soft)] text-accent" : "text-fg-3 hover:bg-[var(--bg-elevated)]"}`}>{t}</button>
                ))}
              </div>
            </div>
            <div className="h-[280px] w-full flex items-end justify-between gap-1 relative">
              <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                {[0, 1, 2, 3].map(i => <div key={i} className="border-t border-[var(--bd)] w-full" />)}
              </div>
              {chartBars.map((h, i) => (
                <div
                  key={i}
                  className={`flex-1 rounded-t-sm relative transition-all hover:opacity-80 cursor-pointer ${i === 7 ? "bg-vi/20 hover:bg-vi/30" : "bg-accent/10 hover:bg-accent/20"}`}
                  style={{ height: `${h}%` }}
                >
                  <div className={`absolute top-0 w-full h-0.5 rounded-full ${i === 7 ? "bg-vi" : "bg-accent"}`} />
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-4 font-mono text-[9px] text-fg-4 uppercase tracking-widest">
              {["12:00 PM", "12:15 PM", "12:30 PM", "12:45 PM", "01:00 PM"].map(t => <span key={t}>{t}</span>)}
            </div>
          </section>

          {/* Service Trace Latency */}
          <section className="col-span-12 lg:col-span-4 glass-panel p-6 rounded-xl">
            <h2 className="font-headline text-base font-semibold mb-6 flex items-center gap-2 text-fg-1">
              <span className="material-symbols-outlined text-accent" style={{ fontSize: "18px" }}>alt_route</span>
              Service Trace Latency
            </h2>
            <div className="space-y-5">
              {services.map((s) => (
                <div key={s.name} className="space-y-2">
                  <div className="flex justify-between font-mono text-[11px]">
                    <span className="text-fg-3">{s.name}</span>
                    <span className={s.highlight ? "text-warn font-bold" : "text-accent"}>{s.latency}</span>
                  </div>
                  <div className="w-full bg-[var(--bg-elevated)] rounded-full h-1 overflow-hidden">
                    <div className={`h-full rounded-full ${s.highlight ? "bg-warn" : "bg-accent"}`} style={{ width: `${s.pct}%` }} />
                  </div>
                </div>
              ))}
              <div className="pt-4 mt-2 border-t border-[var(--bd)] flex items-center justify-between font-mono text-[10px] text-fg-4 uppercase tracking-widest">
                <span>Global Average</span>
                <span className="font-bold text-fg-1">71ms</span>
              </div>
            </div>
          </section>

          {/* Error Logs */}
          <section className="col-span-12 glass-panel rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-[var(--bd)] flex justify-between items-center">
              <h2 className="font-headline text-base font-semibold flex items-center gap-2 text-fg-1">
                <span className="material-symbols-outlined text-neg" style={{ fontSize: "18px" }}>emergency_home</span>
                Live Error Logs
              </h2>
              <button className="font-mono text-[10px] uppercase tracking-widest text-accent flex items-center gap-1 hover:underline">
                View all <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>arrow_outward</span>
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-[var(--bg-elevated)] font-mono text-[9px] uppercase tracking-widest text-fg-4">
                  <tr>
                    {["Timestamp", "Service", "Level", "Event Description", "Trace ID"].map((h, i) => (
                      <th key={h} className={`px-6 py-3 ${i === 4 ? "text-right" : ""}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--bd)]">
                  {errorLogs.map((log, i) => (
                    <tr key={i} className="hover:bg-[var(--bg-elevated)] transition-colors">
                      <td className="px-6 py-4 font-mono text-[10px] text-fg-4 tabular-nums">{log.time}</td>
                      <td className="px-6 py-4 font-mono text-xs font-semibold text-fg-2">{log.service}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-0.5 rounded-full font-mono text-[9px] font-bold uppercase tracking-wider ${log.cls}`}>{log.level}</span>
                      </td>
                      <td className="px-6 py-4 font-mono text-[11px] text-fg-3">{log.desc}</td>
                      <td className="px-6 py-4 text-right font-mono text-[10px] text-fg-4">{log.trace}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Bottom stat cards */}
          <div className="col-span-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {bottomStats.map((s) => (
              <div key={s.label} className="glass-panel p-5 rounded-xl flex flex-col justify-between h-28">
                <div className="flex justify-between items-start">
                  <span className="font-mono text-[9px] uppercase tracking-widest text-fg-4">{s.label}</span>
                  <span className="material-symbols-outlined text-accent" style={{ fontSize: "18px" }}>{s.icon}</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-headline font-bold text-fg-1">{s.value}</span>
                  <span className={`font-mono text-[10px] ${s.dc}`}>{s.delta}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
