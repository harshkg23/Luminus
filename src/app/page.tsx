import Link from "next/link";

const features = [
  {
    title: "Async PR Intelligence",
    description:
      "Analyze pull requests in the background and deliver review-ready findings in minutes.",
  },
  {
    title: "Security and Reliability",
    description:
      "Catch risky patterns, dependency issues, and weak auth checks before they reach production.",
  },
  {
    title: "Architecture Guardrails",
    description:
      "Enforce repository conventions and layer boundaries with consistent, low-noise checks.",
  },
  {
    title: "Explainable Suggestions",
    description:
      "Every recommendation includes reasoning, impact, and practical next actions for developers.",
  },
];

const stats = [
  { label: "Average review turnaround", value: "< 5 min" },
  { label: "False-positive focused design", value: "Low noise" },
  { label: "Supported VCS providers", value: "GitHub + GitLab" },
];

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050816] text-white">
      <div className="pointer-events-none absolute -left-24 top-20 h-80 w-80 rounded-full bg-cyan-500/20 blur-[100px]" />
      <div className="pointer-events-none absolute -right-20 top-0 h-[26rem] w-[26rem] rounded-full bg-violet-500/20 blur-[120px]" />

      <main className="relative mx-auto flex w-full max-w-6xl flex-col px-6 pb-16 pt-8 md:px-10 lg:px-12">
        <header className="mb-12 flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur md:px-6">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-cyan-300 to-blue-500" />
            <div>
              <p className="text-sm font-semibold tracking-wide text-slate-100">Luminus</p>
              <p className="text-xs text-slate-400">AI Review Copilot</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/auth"
              className="rounded-lg border border-white/20 px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-cyan-300/60 hover:bg-cyan-400/10"
            >
              Login
            </Link>
            <Link
              href="/auth"
              className="rounded-lg bg-gradient-to-r from-cyan-400 to-blue-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:opacity-90"
            >
              Sign Up
            </Link>
          </div>
        </header>

        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-[linear-gradient(140deg,#0f1635_0%,#0b1230_40%,#111028_100%)] p-7 shadow-2xl shadow-blue-950/30 md:p-12">
          <div className="absolute -bottom-24 right-0 h-72 w-72 rounded-full bg-blue-500/20 blur-3xl" />
          <div className="absolute -top-16 left-1/3 h-44 w-44 rounded-full bg-violet-500/20 blur-3xl" />

          <div className="relative z-10 max-w-4xl">
            <p className="mb-4 inline-flex rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100">
              Problem Statement 2 - AI-Powered Code Review
            </p>

            <h1 className="text-4xl font-black leading-tight sm:text-5xl md:text-6xl">
              Make pull request reviews
              <span className="block bg-gradient-to-r from-cyan-200 via-blue-200 to-violet-300 bg-clip-text text-transparent">
                fast, reliable, and explainable
              </span>
            </h1>

            <p className="mt-5 max-w-3xl text-base leading-7 text-slate-300 md:text-lg">
              Luminus runs asynchronous code review workflows that catch bugs,
              security risks, and architecture violations, then posts contextual
              feedback your team can act on immediately.
            </p>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/dashboard"
                className="rounded-full bg-linear-to-r from-cyan-400 to-blue-500 px-6 py-3 text-sm font-bold text-slate-950 transition hover:scale-[1.02]"
              >
                Open Dashboard
              </Link>
              <Link
                href="/demo"
                className="rounded-full border border-white/30 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:border-cyan-300/70 hover:bg-cyan-300/10"
              >
                Open Demo Frontend
              </Link>
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-3 md:grid-cols-3">
          {stats.map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 backdrop-blur"
            >
              <p className="text-xs uppercase tracking-widest text-slate-400">{item.label}</p>
              <p className="mt-2 text-xl font-semibold text-cyan-100">{item.value}</p>
            </div>
          ))}
        </section>

        <section className="mt-10 grid gap-4 md:grid-cols-2">
          {features.map((feature) => (
            <article
              key={feature.title}
              className="group rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-6 transition hover:-translate-y-0.5 hover:border-cyan-300/40"
            >
              <h2 className="text-lg font-bold text-slate-100 transition group-hover:text-cyan-200">
                {feature.title}
              </h2>
              <p className="mt-2 text-sm leading-7 text-slate-300">{feature.description}</p>
            </article>
          ))}
        </section>

        <section className="mt-10 rounded-3xl border border-cyan-300/20 bg-gradient-to-r from-cyan-500/10 via-blue-500/10 to-violet-500/10 p-8 text-center">
          <h3 className="text-2xl font-extrabold text-white md:text-3xl">
            Ready to ship cleaner pull requests?
          </h3>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-slate-300 md:text-base">
            Sign in and connect your repositories to start receiving intelligent,
            explainable feedback on every PR.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <Link
              href="/auth"
              className="rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 px-6 py-3 text-sm font-bold text-slate-950 transition hover:opacity-90"
            >
              Login
            </Link>
            <Link
              href="/auth"
              className="rounded-xl border border-white/20 bg-white/5 px-6 py-3 text-sm font-semibold text-slate-100 transition hover:border-cyan-300/60"
            >
              Create Account
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
