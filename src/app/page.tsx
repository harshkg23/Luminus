"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";

/* ── tiny animated counter ── */
function Counter({ to, suffix = "" }: { to: number; suffix?: string }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let start = 0;
    const step = Math.ceil(to / 60);
    const id = setInterval(() => {
      start = Math.min(start + step, to);
      setVal(start);
      if (start >= to) clearInterval(id);
    }, 18);
    return () => clearInterval(id);
  }, [to]);
  return <>{val.toLocaleString()}{suffix}</>;
}

const AGENT_STEPS = [
  { icon: "architecture",   label: "Architect", sub: "Plans & analyses the codebase" },
  { icon: "smart_toy",      label: "Scripter",  sub: "Generates & runs Playwright tests" },
  { icon: "healing",        label: "Healer",    sub: "RCA + code-patch generation" },
  { icon: "local_shipping", label: "Courier",   sub: "Creates PRs & Slack alerts" },
];

const INTEGRATIONS = [
  { label: "GitHub",     icon: "hub" },
  { label: "Next.js",    icon: "web" },
  { label: "LangGraph",  icon: "account_tree" },
  { label: "MongoDB",    icon: "database" },
  { label: "Prometheus", icon: "monitoring" },
  { label: "Slack",      icon: "chat" },
];

const DIFF_LINES = [
  { n: "01", text: "- function calculate(a, b) {",                             cls: "text-neg" },
  { n: "02", text: "+ function calculate(input_vector) {",                     cls: "text-pos" },
  { n: "03", text: "  // Semantic Mapping Applied",                            cls: "text-[var(--fg-4)]" },
  { n: "04", text: "-   return a * b;",                                        cls: "text-neg" },
  { n: "05", text: "+   return input_vector.reduce((a,v) => a*v, 1);",        cls: "text-pos" },
];

export default function LandingPage() {
  const { data: session } = useSession();
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setActiveStep((s) => (s + 1) % AGENT_STEPS.length), 2000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--bg-base)", color: "var(--fg-1)" }}
    >

      {/* ─── NAV ─── */}
      <nav
        className="fixed top-0 inset-x-0 z-50 border-b"
        style={{
          background: "color-mix(in srgb, var(--bg-base) 80%, transparent)",
          backdropFilter: "blur(20px)",
          borderColor: "var(--bd)",
        }}
      >
        <div className="w-full px-8 h-14 flex items-center justify-between">
          {/* Logo — far left */}
          <Link href="/" className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-md flex items-center justify-center text-[10px] font-bold text-white kinetic-gradient"
            >
              TG
            </div>
            <span className="font-headline font-bold tracking-tight" style={{ color: "var(--fg-1)" }}>
              toll<span style={{ color: "var(--accent)" }}>Gate</span>
            </span>
          </Link>

          {/* CTA — far right */}
          <div className="flex items-center gap-3">
            {session ? (
              <>
                <button
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="text-sm font-medium transition-colors hover:text-neg"
                  style={{ color: "var(--fg-3)" }}
                >
                  Logout
                </button>
                <Link
                  href="/dashboard"
                  className="px-4 py-1.5 rounded-lg text-sm font-bold text-white kinetic-gradient transition-all hover:brightness-110 active:scale-95"
                  style={{ boxShadow: "0 0 18px color-mix(in srgb, var(--accent) 30%, transparent)" }}
                >
                  Dashboard
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/auth/signin"
                  className="text-sm font-medium transition-colors"
                  style={{ color: "var(--fg-3)" }}
                >
                  Login
                </Link>
                <Link
                  href="/auth/signin"
                  className="px-4 py-1.5 rounded-lg text-sm font-bold text-white kinetic-gradient transition-all hover:brightness-110 active:scale-95"
                  style={{ boxShadow: "0 0 18px color-mix(in srgb, var(--accent) 30%, transparent)" }}
                >
                  Get Started
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>


      {/* ─── HERO ─── */}
      <section className="relative pt-40 pb-28 px-6 overflow-hidden">
        {/* grid bg */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle, color-mix(in srgb, var(--accent) 7%, transparent) 1px, transparent 1px)",
            backgroundSize: "34px 34px",
          }}
        />
        {/* glow blobs */}
        <div
          className="pointer-events-none absolute rounded-full blur-[100px]"
          style={{
            width: 420, height: 420, top: -80, left: -80,
            background: "color-mix(in srgb, var(--accent) 12%, transparent)",
          }}
        />
        <div
          className="pointer-events-none absolute rounded-full blur-[120px]"
          style={{
            width: 360, height: 360, top: 60, right: -60,
            background: "color-mix(in srgb, var(--vi) 10%, transparent)",
          }}
        />

        <div className="relative z-10 max-w-4xl mx-auto text-center">
          {/* status pill */}
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border mb-10"
            style={{ background: "var(--bg-card)", borderColor: "var(--bd)" }}
          >
            <span
              className="w-2 h-2 rounded-full animate-pulse"
              style={{ background: "var(--pos)" }}
            />
            <span
              className="font-mono text-[11px] uppercase tracking-widest"
              style={{ color: "var(--data)" }}
            >
              Protocol v2.4 Active
            </span>
          </div>

          <h1
            className="text-5xl md:text-7xl font-black font-headline tracking-tighter leading-[0.9] mb-8"
            style={{ color: "var(--fg-1)" }}
          >
            Code Reviews that{" "}
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: "linear-gradient(135deg, var(--accent), var(--vi))" }}
            >
              Fix Themselves.
            </span>
          </h1>

          <p
            className="text-lg md:text-xl max-w-2xl mx-auto leading-relaxed mb-12"
            style={{ color: "var(--fg-3)" }}
          >
            tollGate is the first autonomous AI co-pilot that doesn&apos;t just find
            bugs — it writes the patches. Powered by RAG-memory and semantic diff
            analysis.
          </p>

          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Link
              href="/dashboard"
              className="px-8 py-4 rounded-xl font-bold text-white kinetic-gradient hover:brightness-110 active:scale-95 transition-all"
              style={{ boxShadow: "0 0 24px color-mix(in srgb, var(--accent) 28%, transparent)" }}
            >
              Start Your Free Trial
            </Link>
            <Link
              href="/demo"
              className="px-8 py-4 rounded-xl font-semibold border flex items-center justify-center gap-2 transition-colors hover:border-accent/40"
              style={{
                color: "var(--fg-2)",
                borderColor: "var(--bd-2)",
                background: "transparent",
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: "20px" }}>
                play_circle
              </span>
              Watch Demo
            </Link>
          </div>

          {/* stats strip */}
          <div className="mt-20 flex flex-wrap justify-center gap-x-14 gap-y-8">
            {[
              { to: 2000, suffix: "+", label: "Engineering teams" },
              { to: 94,   suffix: "%", label: "Avg confidence score" },
              { to: 28,   suffix: "s", label: "Avg MTTR" },
              { to: 13,   suffix: "x", label: "Faster remediation" },
            ].map(({ to, suffix, label }) => (
              <div key={label} className="flex flex-col items-center gap-1">
                <span
                  className="text-3xl font-black font-headline"
                  style={{ color: "var(--accent)" }}
                >
                  <Counter to={to} suffix={suffix} />
                </span>
                <span
                  className="font-mono text-[11px] uppercase tracking-widest"
                  style={{ color: "var(--fg-4)" }}
                >
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── KINETIC LOOP ─── */}
      <section className="py-24 px-6">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-4 space-y-5">
            <h2
              className="text-3xl font-headline font-bold tracking-tight"
              style={{ color: "var(--fg-1)" }}
            >
              The Kinetic Loop
            </h2>
            <p style={{ color: "var(--fg-3)", lineHeight: 1.7 }}>
              Our agents operate in a continuous high-precision cycle, evolving from
              simple detection to autonomous repair.
            </p>
            <div
              className="p-4 rounded-xl border-l-2"
              style={{
                background: "var(--bg-card)",
                borderLeftColor: "var(--accent)",
              }}
            >
              <p
                className="font-mono text-[10px] uppercase tracking-widest mb-1"
                style={{ color: "var(--accent)" }}
              >
                Status
              </p>
              <p className="text-sm font-semibold" style={{ color: "var(--fg-1)" }}>
                Autonomous Patching Sequence Active
              </p>
            </div>
          </div>

          <div className="lg:col-span-8">
            <div
              className="rounded-2xl p-8 glass-panel"
            >
              {/* terminal chrome */}
              <div
                className="flex items-center justify-between border-b pb-4 mb-10"
                style={{ borderColor: "var(--bd)" }}
              >
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full" style={{ background: "var(--neg)", opacity: 0.5 }} />
                  <div className="w-3 h-3 rounded-full" style={{ background: "var(--warn)", opacity: 0.5 }} />
                  <div className="w-3 h-3 rounded-full" style={{ background: "var(--pos)", opacity: 0.5 }} />
                </div>
                <span className="font-mono text-[10px]" style={{ color: "var(--fg-4)" }}>
                  agent_loop_monitor.sh
                </span>
              </div>

              {/* connector line */}
              <div className="relative">
                <div
                  className="hidden md:block absolute top-6 left-0 right-0 h-px"
                  style={{
                    background:
                      "linear-gradient(to right, transparent, color-mix(in srgb, var(--accent) 25%, transparent), transparent)",
                  }}
                />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  {AGENT_STEPS.map((step, i) => {
                    const active = i === activeStep;
                    return (
                      <div
                        key={step.label}
                        className="relative z-10 flex flex-col items-center text-center gap-3"
                      >
                        <div
                          className="w-12 h-12 rounded-full border flex items-center justify-center transition-all duration-500"
                          style={{
                            background: active
                              ? "color-mix(in srgb, var(--accent) 18%, transparent)"
                              : "var(--bg-elevated)",
                            borderColor: active ? "var(--accent)" : "var(--bd-2)",
                            color: active ? "var(--accent)" : "var(--fg-4)",
                            boxShadow: active
                              ? "0 0 20px color-mix(in srgb, var(--accent) 25%, transparent)"
                              : "none",
                          }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: "22px" }}>
                            {step.icon}
                          </span>
                        </div>
                        <div>
                          <span
                            className="block text-sm font-headline font-bold"
                            style={{ color: "var(--fg-1)" }}
                          >
                            {step.label}
                          </span>
                          <span
                            className="text-[10px] font-mono uppercase"
                            style={{ color: active ? "var(--accent)" : "var(--fg-4)" }}
                          >
                            {active ? "ACTIVE" : "IDLE"}
                          </span>
                        </div>
                        <p
                          className="text-[11px] leading-relaxed"
                          style={{ color: "var(--fg-4)" }}
                        >
                          {step.sub}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── BENTO: USPs ─── */}
      <section className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2
              className="text-4xl font-headline font-bold mb-3"
              style={{ color: "var(--fg-1)" }}
            >
              Built for Elite Teams
            </h2>
            <p style={{ color: "var(--fg-3)" }}>
              Not just another linter — a full autonomous loop from detection to
              deployment.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Card 1 — spans 2 cols */}
            <div
              className="md:col-span-2 relative p-8 rounded-2xl border overflow-hidden group flex flex-col justify-between min-h-[280px] transition-colors duration-300"
              style={{
                background: "var(--bg-card)",
                borderColor: "var(--bd)",
              }}
            >
              <div
                className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity duration-500"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 140, color: "var(--accent)" }}>
                  memory
                </span>
              </div>
              <div>
                <div
                  className="w-10 h-10 rounded-lg border flex items-center justify-center mb-6"
                  style={{
                    background: "color-mix(in srgb, var(--accent) 10%, transparent)",
                    borderColor: "color-mix(in srgb, var(--accent) 25%, transparent)",
                    color: "var(--accent)",
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>hub</span>
                </div>
                <h3
                  className="text-2xl font-headline font-bold mb-3"
                  style={{ color: "var(--fg-1)" }}
                >
                  RAG-Powered Memory
                </h3>
                <p style={{ color: "var(--fg-3)", lineHeight: 1.7, maxWidth: 400 }}>
                  Every fix is stored in a specialized vector database. Your
                  organization&apos;s collective intelligence compounds with every pull
                  request, creating a bespoke engineering immune system.
                </p>
              </div>
              <div className="mt-8">
                <span
                  className="font-mono text-[11px] uppercase tracking-widest border px-2.5 py-1 rounded-md"
                  style={{
                    color: "var(--accent)",
                    borderColor: "color-mix(in srgb, var(--accent) 30%, transparent)",
                  }}
                >
                  Persistent Context Layer
                </span>
              </div>
            </div>

            {/* Card 2 */}
            <div
              className="p-8 rounded-2xl border flex flex-col min-h-[280px] transition-colors duration-300"
              style={{ background: "var(--bg-elevated)", borderColor: "var(--bd)" }}
            >
              <div
                className="w-10 h-10 rounded-lg border flex items-center justify-center mb-6"
                style={{
                  background: "color-mix(in srgb, var(--pos) 10%, transparent)",
                  borderColor: "color-mix(in srgb, var(--pos) 25%, transparent)",
                  color: "var(--pos)",
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>verified</span>
              </div>
              <h3
                className="text-xl font-headline font-bold mb-3"
                style={{ color: "var(--fg-1)" }}
              >
                Fix-Ready Patches
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: "var(--fg-3)" }}>
                Forget suggestions. We generate ready-to-merge code diffs validated
                with &gt;0.7 confidence scoring before you even see them.
              </p>
              <div
                className="mt-auto pt-5 border-t"
                style={{ borderColor: "var(--bd)" }}
              >
                <div className="flex justify-between items-center mb-2">
                  <span className="font-mono text-[11px]" style={{ color: "var(--fg-4)" }}>
                    AVG_CONFIDENCE
                  </span>
                  <span className="font-mono text-[11px] font-bold" style={{ color: "var(--pos)" }}>
                    94.2%
                  </span>
                </div>
                <div
                  className="w-full rounded-full h-1.5 overflow-hidden"
                  style={{ background: "var(--bg-base)" }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-1000"
                    style={{ width: "94.2%", background: "var(--pos)" }}
                  />
                </div>
              </div>
            </div>

            {/* Card 3 — full width */}
            <div
              className="md:col-span-3 p-8 rounded-2xl border flex flex-col md:flex-row gap-10 items-start md:items-center transition-colors duration-300"
              style={{ background: "var(--bg-card)", borderColor: "var(--bd)" }}
            >
              <div className="md:w-1/2">
                <div
                  className="w-10 h-10 rounded-lg border flex items-center justify-center mb-6"
                  style={{
                    background: "color-mix(in srgb, var(--vi) 10%, transparent)",
                    borderColor: "color-mix(in srgb, var(--vi) 25%, transparent)",
                    color: "var(--vi)",
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>data_object</span>
                </div>
                <h3
                  className="text-2xl font-headline font-bold mb-3"
                  style={{ color: "var(--fg-1)" }}
                >
                  Semantic Diff Understanding
                </h3>
                <p style={{ color: "var(--fg-3)", lineHeight: 1.7 }}>
                  Unlike LLMs that look at lines of text, tollGate analyzes structural
                  changes in your Abstract Syntax Tree. We understand logic, not just
                  strings.
                </p>
              </div>
              <div className="md:w-1/2 w-full">
                <div
                  className="p-5 rounded-xl border font-mono text-xs space-y-2"
                  style={{ background: "var(--bg-base)", borderColor: "var(--bd-2)" }}
                >
                  {DIFF_LINES.map(({ n, text, cls }) => (
                    <div key={n} className="flex gap-4">
                      <span
                        className="shrink-0 select-none w-5 text-right"
                        style={{ color: "var(--fg-4)" }}
                      >
                        {n}
                      </span>
                      <span className={cls}>{text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── INTEGRATIONS ─── */}
      <section className="py-24 px-6 text-center">
        <div className="max-w-6xl mx-auto">
          <h2
            className="text-4xl font-headline font-bold mb-3"
            style={{ color: "var(--fg-1)" }}
          >
            Seamlessly Integrated
          </h2>
          <p className="mb-14" style={{ color: "var(--fg-3)" }}>
            Plugs into your existing stack in minutes.
          </p>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-6 max-w-3xl mx-auto">
            {INTEGRATIONS.map(({ label, icon }) => (
              <div key={label} className="flex flex-col items-center gap-3 group cursor-pointer">
                <div
                  className="w-20 h-20 rounded-xl border flex items-center justify-center transition-all duration-300 group-hover:scale-105"
                  style={{
                    background: "var(--bg-card)",
                    borderColor: "var(--bd)",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.borderColor =
                      "color-mix(in srgb, var(--accent) 40%, transparent)";
                    (e.currentTarget as HTMLDivElement).style.background =
                      "color-mix(in srgb, var(--accent) 5%, var(--bg-card))";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.borderColor = "var(--bd)";
                    (e.currentTarget as HTMLDivElement).style.background = "var(--bg-card)";
                  }}
                >
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: 36, color: "var(--fg-3)", transition: "color 0.2s" }}
                  >
                    {icon}
                  </span>
                </div>
                <span
                  className="font-mono text-[11px]"
                  style={{ color: "var(--fg-4)" }}
                >
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className="py-28 px-6">
        <div className="max-w-5xl mx-auto">
          <div
            className="p-px rounded-2xl"
            style={{
              background:
                "linear-gradient(135deg, color-mix(in srgb, var(--accent) 50%, transparent), color-mix(in srgb, var(--vi) 50%, transparent))",
            }}
          >
            <div
              className="rounded-2xl p-12 md:p-20 text-center relative overflow-hidden"
              style={{ background: "var(--bg-card)" }}
            >
              {/* inner grid */}
              <div
                className="pointer-events-none absolute inset-0 opacity-20"
                style={{
                  backgroundImage:
                    "radial-gradient(circle, color-mix(in srgb, var(--accent) 8%, transparent) 1px, transparent 1px)",
                  backgroundSize: "32px 32px",
                }}
              />
              {/* inner glow */}
              <div
                className="pointer-events-none absolute rounded-full blur-[90px]"
                style={{
                  width: 280, height: 280,
                  top: "50%", left: "50%",
                  transform: "translate(-50%, -60%)",
                  background: "color-mix(in srgb, var(--accent) 12%, transparent)",
                }}
              />

              <div className="relative z-10">
                <h2
                  className="text-4xl md:text-6xl font-headline font-black mb-6"
                  style={{ color: "var(--fg-1)" }}
                >
                  Stop chasing bugs.
                  <br />
                  <span style={{ color: "var(--accent)" }}>Start shipping fixes.</span>
                </h2>
                <p
                  className="text-lg mb-12 max-w-xl mx-auto"
                  style={{ color: "var(--fg-3)" }}
                >
                  Join 2,000+ engineering teams automating their technical debt
                  recovery with tollGate.
                </p>
                <Link
                  href="/dashboard"
                  className="inline-block px-10 py-4 rounded-xl font-bold text-white text-lg kinetic-gradient hover:brightness-110 active:scale-95 transition-all"
                  style={{
                    boxShadow: "0 0 32px color-mix(in srgb, var(--accent) 32%, transparent)",
                  }}
                >
                  Deploy Your First Agent
                </Link>
                <p
                  className="mt-8 font-mono text-[11px] uppercase tracking-widest"
                  style={{ color: "var(--fg-4)" }}
                >
                  Enterprise SLA &amp; SOC2 Type II Certified
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer
        className="border-t py-12 px-6"
        style={{ borderColor: "var(--bd)", background: "var(--bg-surface)" }}
      >
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-10">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 rounded kinetic-gradient flex items-center justify-center text-[9px] font-bold text-white">
                TG
              </div>
              <span className="font-headline font-bold" style={{ color: "var(--fg-1)" }}>
                tollGate
              </span>
            </div>
            <p
              className="text-sm max-w-xs leading-relaxed mb-5"
              style={{ color: "var(--fg-4)" }}
            >
              Autonomous AI for elite engineering teams. The kinetic bridge between
              code and production.
            </p>
            <p className="text-sm" style={{ color: "var(--fg-4)" }}>
              © 2024 tollGate AI. Engineered for precision.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-8">
            {[
              {
                title: "Product",
                links: [
                  { label: "Dashboard", href: "/dashboard" },
                  { label: "Pipeline",  href: "/pipeline"  },
                  { label: "PRs",       href: "/prs"        },
                ],
              },
              {
                title: "System",
                links: [
                  { label: "Metrics",  href: "/metrics"  },
                  { label: "Repos",    href: "/repos"    },
                  { label: "Settings", href: "/settings" },
                ],
              },
              {
                title: "Account",
                links: [
                  { label: "Login",  href: "/auth/signin" },
                  { label: "Demo",   href: "/demo"        },
                ],
              },
            ].map(({ title, links }) => (
              <div key={title} className="flex flex-col gap-3">
                <h4
                  className="text-sm font-bold mb-1"
                  style={{ color: "var(--fg-1)" }}
                >
                  {title}
                </h4>
                {links.map(({ label, href }) => (
                  <Link
                    key={label}
                    href={href}
                    className="text-sm transition-colors"
                    style={{ color: "var(--fg-4)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "var(--fg-1)")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "var(--fg-4)")}
                  >
                    {label}
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
