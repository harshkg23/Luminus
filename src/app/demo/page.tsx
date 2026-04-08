export default function DemoPage() {
  return (
    <main className="min-h-screen bg-[#050816] text-white px-6 py-10">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="rounded-3xl border border-violet-400/30 bg-white/5 p-8">
          <p className="text-xs uppercase tracking-[0.2em] text-violet-200">Hackathon Demo Frontend</p>
          <h1 className="mt-2 text-4xl font-black">AI Code Review Co-Pilot Simulation</h1>
          <p className="mt-3 text-slate-300">
            This dummy frontend is for demo storytelling: PR opened, AI runs review, inline suggestions generated,
            and team receives a Slack summary.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          {[
            "PR Opened",
            "Diff + Context Analyzed",
            "Findings Prioritized",
            "Inline Suggestions Posted",
          ].map((step, i) => (
            <article key={step} className="rounded-2xl border border-white/15 bg-black/20 p-4">
              <p className="text-xs text-cyan-300">Step {i + 1}</p>
              <h2 className="mt-2 text-sm font-bold">{step}</h2>
            </article>
          ))}
        </section>

        <section className="rounded-2xl border border-cyan-300/30 bg-cyan-400/10 p-6">
          <h2 className="text-xl font-bold">Additional Winning Features Highlight</h2>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-200">
            <li>One-click auto-remediation suggestion blocks.</li>
            <li>PR cost impact estimate to prevent expensive patterns early.</li>
            <li>Tone controls for reviewer persona.</li>
            <li>False-positive learning loop with ignore-intentional feedback.</li>
          </ul>
        </section>
      </div>
    </main>
  );
}
