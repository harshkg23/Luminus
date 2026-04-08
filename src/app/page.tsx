import TopBar from "@/components/TopBar";

const agents = [
  { icon: "architecture",     name: "Architect", status: "Running", task: "Syncing system graph...",   progress: 78, active: true       },
  { icon: "data_object",      name: "Scripter",  status: "Idle",    task: "Awaiting task queue",       progress: 0,  active: false      },
  { icon: "visibility",       name: "Watchdog",  status: "Running", task: "Monitoring egress",         progress: 94, active: true, pulse: true },
  { icon: "medical_services", name: "Healer",    status: "Idle",    task: "Patches up to date",        progress: 0,  active: false      },
  { icon: "local_shipping",   name: "Courier",   status: "Running", task: "Delivering payload v.2",    progress: 42, active: true       },
];

const logLines = [
  { time: "14:02:11", level: "INFO",    cc: "text-data", text: "Agent Architect successfully initialized node cluster [US-EAST-1]" },
  { time: "14:02:15", level: "INFO",    cc: "text-data", text: "Requesting verification tokens for deployment tunnel..." },
  { time: "14:02:18", level: "WARN",    cc: "text-warn", text: "High latency detected in Watchdog ping (142ms). Rerouting internal heartbeat." },
  { time: "14:02:22", level: "SUCCESS", cc: "text-pos",  text: "Token hash confirmed: 0x4f...a9c2. Channel established." },
  { time: "14:02:29", level: "INFO",    cc: "text-data", text: "Courier agent starting payload delivery to endpoint /api/v1/prod/ingress" },
  { time: "14:02:41", level: "INFO",    cc: "text-data", text: "Packet inspection completed by Watchdog. 0 anomalies detected." },
  { time: "14:03:02", level: "INFO",    cc: "text-data", text: "Architect performing final post-deploy structure validation." },
];

const activity = [
  { title: "Deploy Complete",      time: "12m ago", err: false, desc: "Agent Architect finished production roll-out for project 'Zephyr'" },
  { title: "New Agent Created",    time: "45m ago", err: false, desc: "Scripter-Gamma was provisioned by system-user 'admin_01'" },
  { title: "Anomaly Resolved",     time: "2h ago",  err: true,  desc: "Agent Healer patched memory leak in Kubernetes namespace 'tollgate-core'" },
  { title: "Metrics Recalibrated", time: "5h ago",  err: false, desc: "Global threshold updated to 50ms based on last 7 days of training data." },
];

const SearchCenter = () => (
  <div className="flex items-center gap-2 bg-[var(--bg-card)] border border-[var(--bd)] px-3 py-1.5 rounded-lg w-52">
    <span className="material-symbols-outlined text-fg-3" style={{ fontSize: "15px" }}>search</span>
    <input
      className="bg-transparent outline-none text-xs font-mono text-fg-2 placeholder:text-fg-4 w-full"
      placeholder="Jump to command…"
    />
  </div>
);

export default function Dashboard() {
  return (
    <>
      <TopBar center={<SearchCenter />} />

      <div className="p-7 space-y-8 max-w-[1600px]">

        {/* Stat cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[
            { label: "Response Latency", value: "12.4", unit: "ms",  icon: "trending_down", delta: "-2.1% from last hour",  dc: "text-pos"  },
            { label: "Error Rate",        value: "0.02",  unit: "%",   icon: "network_node",  delta: "Stationary Trend",     dc: "text-fg-3" },
            { label: "MTTR Trend",        value: "14",    unit: "min", icon: "trending_up",   delta: "+3min drift detected",  dc: "text-neg"  },
          ].map(({ label, value, unit, icon, delta, dc }) => (
            <div key={label} className="glass-panel p-6 rounded-xl">
              <p className="font-mono text-[10px] uppercase tracking-widest text-fg-3 mb-1">{label}</p>
              <h3 className="text-3xl font-headline font-bold text-accent">
                {value}<span className="text-sm ml-1 font-normal text-fg-3">{unit}</span>
              </h3>
              <div className={`mt-4 flex items-center gap-1.5 text-xs font-mono ${dc}`}>
                <span className="material-symbols-outlined" style={{ fontSize: "13px" }}>{icon}</span>
                {delta}
              </div>
            </div>
          ))}
        </div>

        {/* Agent Squad */}
        <section>
          <div className="flex justify-between items-end mb-5">
            <div>
              <h2 className="text-lg font-headline font-bold text-fg-1">Agent Squad Status</h2>
              <p className="font-mono text-[10px] text-fg-3 uppercase tracking-widest mt-0.5">Real-time status of your autonomous fleet</p>
            </div>
            <button className="font-mono text-[10px] text-accent uppercase tracking-widest flex items-center gap-1 hover:underline">
              Analytics <span className="material-symbols-outlined" style={{ fontSize: "13px" }}>arrow_forward</span>
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {agents.map((a) => (
              <div key={a.name} className={`glass-panel p-5 rounded-xl border-l-2 ${a.active ? "border-accent" : "border-[var(--bd-2)]"}`}>
                <div className="flex justify-between items-start mb-4">
                  <span className={`material-symbols-outlined text-2xl ${a.active ? "text-accent" : "text-fg-4"}`}>{a.icon}</span>
                  <span className={`px-2 py-0.5 rounded font-mono text-[9px] uppercase tracking-widest ${a.active ? "bg-[var(--accent-soft)] text-accent" : "bg-[var(--bg-elevated)] text-fg-4"}`}>
                    {a.status}
                  </span>
                </div>
                <h4 className="font-headline font-bold text-sm text-fg-1 mb-0.5">{a.name}</h4>
                <p className="font-mono text-[10px] text-fg-4 mb-3">{a.task}</p>
                <div className="w-full bg-[var(--bg-elevated)] h-0.5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${a.active ? "bg-accent" : "bg-[var(--bd-2)]"} ${"pulse" in a && a.pulse ? "animate-pulse" : ""}`}
                    style={{ width: `${a.progress}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Terminal + Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-7">
          {/* Terminal */}
          <div className="lg:col-span-8 flex flex-col h-[460px]">
            <div className="flex items-center justify-between bg-[var(--bg-elevated)] px-4 py-2 rounded-t-xl border border-[var(--bd)] border-b-0">
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-neg/50" />
                  <div className="w-2.5 h-2.5 rounded-full bg-warn/50" />
                  <div className="w-2.5 h-2.5 rounded-full bg-pos/50" />
                </div>
                <span className="font-mono text-[9px] text-fg-3 uppercase tracking-widest ml-2">
                  Live Stream · Core_Protocol_Alpha
                </span>
              </div>
              <span className="font-mono text-[9px] text-data animate-pulse">● CONNECTED</span>
            </div>
            <div className="flex-1 bg-[var(--bg-card)] border border-[var(--bd)] rounded-b-xl p-5 font-mono text-[12px] terminal-scroll overflow-y-auto">
              <div className="space-y-2">
                {logLines.map((l, i) => (
                  <div key={i} className="flex gap-4">
                    <span className="text-fg-4 shrink-0 tabular-nums">{l.time}</span>
                    <span className={`${l.cc} shrink-0`}>[{l.level}]</span>
                    <span className="text-fg-2">{l.text}</span>
                  </div>
                ))}
                <div className="flex gap-4">
                  <span className="text-fg-4 shrink-0">14:03:05</span>
                  <span className="text-accent animate-pulse font-bold">_</span>
                </div>
              </div>
            </div>
          </div>

          {/* Activity + Commands */}
          <div className="lg:col-span-4 flex flex-col gap-5">
            <div className="glass-panel p-6 rounded-xl flex-1">
              <h3 className="font-headline font-bold text-sm text-fg-1 mb-5 flex items-center gap-2">
                <span className="material-symbols-outlined text-accent" style={{ fontSize: "17px" }}>history</span>
                Recent Activity
              </h3>
              <div className="space-y-5 relative before:absolute before:left-[10px] before:top-2 before:bottom-2 before:w-px before:bg-[var(--bd)]">
                {activity.map((item, i) => (
                  <div key={i} className="relative pl-7">
                    <div className={`absolute left-0 top-1.5 w-5 h-5 rounded-full flex items-center justify-center border ${item.err ? "border-neg/30 bg-neg/10" : "border-accent/30 bg-[var(--accent-soft)]"}`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${item.err ? "bg-neg" : "bg-accent"}`} />
                    </div>
                    <div className="flex justify-between items-start mb-0.5">
                      <p className={`text-xs font-bold ${item.err ? "text-neg" : "text-fg-1"}`}>{item.title}</p>
                      <span className="font-mono text-[9px] text-fg-4">{item.time}</span>
                    </div>
                    <p className="font-mono text-[10px] text-fg-3 leading-relaxed">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="glass-panel p-5 rounded-xl border border-[var(--accent-soft)]">
              <h4 className="font-mono text-[9px] text-accent uppercase tracking-widest mb-3">Command Presets</h4>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { icon: "restart_alt",      label: "Flush Cache"  },
                  { icon: "settings_ethernet",label: "Cycle Nodes"  },
                  { icon: "security",         label: "Lock Egress"  },
                  { icon: "history",          label: "Snapshot"     },
                ].map(({ icon, label }) => (
                  <button key={label} className="bg-[var(--bg-card)] hover:bg-[var(--accent-soft)] hover:text-accent py-2 px-2 rounded text-[10px] font-mono uppercase tracking-widest text-fg-3 flex items-center gap-1.5 transition-all">
                    <span className="material-symbols-outlined" style={{ fontSize: "13px" }}>{icon}</span>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-auto border-t border-[var(--bd)] bg-surface px-8 py-3 flex items-center justify-between font-mono text-[10px] text-fg-4 uppercase tracking-widest">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-pos" />Primary Cluster: Active</div>
          <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-pos" />API Gateway: 200 OK</div>
        </div>
        <div className="flex items-center gap-6">
          <span>CPU: 12.4%</span>
          <span>MEM: 2.1GB / 16GB</span>
          <span className="text-accent">Uptime: 45d 12h 04m</span>
        </div>
      </footer>
    </>
  );
}
