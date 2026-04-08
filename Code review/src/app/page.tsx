export default function Home() {
  const keyOutcomes = [
    "Catch bugs before human review starts",
    "Flag security vulnerabilities and risky patterns",
    "Enforce architecture rules with low false positives",
    "Generate contextual, actionable inline comments",
  ];

  const capabilities = [
    {
      title: "Asynchronous PR Analysis",
      description:
        "Scans pull requests in the background and returns insights in minutes, not hours.",
    },
    {
      title: "Security and Reliability Radar",
      description:
        "Detects potential injections, auth gaps, unsafe dependencies, and fragile logic paths.",
    },
    {
      title: "Architectural Consistency Guard",
      description:
        "Tracks code smells and design rule violations across modules, services, and layers.",
    },
    {
      title: "Explainable AI Feedback",
      description:
        "Every comment includes reasoning, impact, and a practical next step for developers.",
    },
  ];

  return (
    <div className="min-h-screen bg-[#060816] text-white">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-14 px-6 py-10 md:px-10 lg:px-14">
        <section className="relative overflow-hidden rounded-3xl border border-white/15 bg-[radial-gradient(circle_at_10%_20%,rgba(59,130,246,0.25),transparent_45%),radial-gradient(circle_at_90%_10%,rgba(168,85,247,0.35),transparent_40%),linear-gradient(135deg,#111736,#080b1d_55%,#070913)] p-8 shadow-2xl shadow-blue-950/40 md:p-12">
          <div className="absolute -top-12 right-16 h-44 w-44 rounded-full bg-violet-500/20 blur-3xl" />
          <div className="absolute -bottom-16 left-14 h-56 w-56 rounded-full bg-blue-500/20 blur-3xl" />

          <div className="relative z-10 flex flex-col gap-8">
            <div className="inline-flex w-fit items-center rounded-full border border-cyan-300/40 bg-cyan-300/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100">
              Problem Statement 2 - AI-Powered Code Review Co-Pilot
            </div>

            <div className="max-w-3xl space-y-5">
              <h1 className="text-4xl font-black leading-tight sm:text-5xl md:text-6xl">
                Luminus Review Copilot
                <span className="block bg-linear-to-r from-blue-300 via-cyan-200 to-violet-300 bg-clip-text text-transparent">
                  Your Autonomous Pull Request Intelligence
                </span>
              </h1>
              <p className="text-base leading-7 text-blue-100/90 md:text-lg">
                A creative AI assistant that reviews pull requests asynchronously,
                detects bugs and security risks, spots code smells, validates
                architecture decisions, and posts contextual inline feedback on
                GitHub or GitLab with minimal noise.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button className="rounded-full bg-linear-to-r from-cyan-400 to-blue-500 px-6 py-3 text-sm font-bold text-slate-950 transition hover:scale-[1.02]">
                Start Reviewing in Background
              </button>
              <button className="rounded-full border border-white/30 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:border-cyan-300/70 hover:bg-cyan-300/10">
                View Architecture Rules
              </button>
            </div>

            <div className="grid gap-3 pt-2 sm:grid-cols-2">
              {keyOutcomes.map((item) => (
                <div
                  key={item}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100 backdrop-blur"
                >
                  {item}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          {capabilities.map((capability) => (
            <article
              key={capability.title}
              className="rounded-2xl border border-white/10 bg-white/3 p-6 transition hover:-translate-y-1 hover:border-blue-300/40 hover:bg-white/6"
            >
              <h2 className="text-xl font-bold text-cyan-100">{capability.title}</h2>
              <p className="mt-3 text-sm leading-7 text-slate-300">
                {capability.description}
              </p>
            </article>
          ))}
        </section>

        <section className="rounded-3xl border border-blue-300/20 bg-[linear-gradient(120deg,rgba(37,99,235,0.12),rgba(14,165,233,0.05),rgba(168,85,247,0.1))] p-8 md:p-10">
          <h3 className="text-2xl font-extrabold text-white md:text-3xl">
            How The Copilot Works
          </h3>
          <div className="mt-7 grid gap-4 md:grid-cols-4">
            {[
              "PR webhook triggers analysis pipeline",
              "AI inspects diffs + history + dependency graph",
              "Risk score computed with architecture policies",
              "Inline comments published with explanation",
            ].map((step, index) => (
              <div
                key={step}
                className="rounded-2xl border border-white/15 bg-slate-900/50 p-4"
              >
                <p className="text-xs font-bold uppercase tracking-widest text-cyan-300">
                  Step {index + 1}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-200">{step}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-[#0a1024] p-8">
          <p className="text-center text-sm uppercase tracking-[0.2em] text-slate-400">
            Built For Accuracy, Scalability, And Developer Trust
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-sm text-slate-200">
            <span className="rounded-full border border-cyan-300/40 px-4 py-2">
              Low false positives
            </span>
            <span className="rounded-full border border-cyan-300/40 px-4 py-2">
              Repo-specific policies
            </span>
            <span className="rounded-full border border-cyan-300/40 px-4 py-2">
              Multi-language support
            </span>
            <span className="rounded-full border border-cyan-300/40 px-4 py-2">
              Human-in-the-loop controls
            </span>
          </div>
        </section>
      </main>
    </div>
  );
}
