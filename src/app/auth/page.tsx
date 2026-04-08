import AuthForm from "@/components/auth/auth-form";
import Link from "next/link";

export default function AuthPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050816] px-6 py-10 text-white">
      <div className="pointer-events-none absolute -left-20 top-16 h-72 w-72 rounded-full bg-cyan-500/20 blur-[100px]" />
      <div className="pointer-events-none absolute -right-20 top-0 h-96 w-96 rounded-full bg-violet-500/20 blur-[120px]" />

      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-8">
        <header className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur md:px-6">
          <Link href="/" className="text-sm font-semibold text-slate-200 hover:text-cyan-200">
            ← Back to home
          </Link>
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Secure Access</p>
        </header>

        <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-8 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-xl">
            <p className="inline-flex rounded-full border border-cyan-300/40 bg-cyan-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100">
              Welcome to Luminus
            </p>
            <h1 className="mt-4 text-4xl font-black leading-tight md:text-5xl">
              Sign in and start
              <span className="block bg-gradient-to-r from-cyan-200 to-violet-300 bg-clip-text text-transparent">
                intelligent code reviews
              </span>
            </h1>
            <p className="mt-4 text-sm leading-7 text-slate-300 md:text-base">
              Use credentials or connect with GitHub/GitLab to access your review
              dashboard, monitor PR quality, and enforce architecture standards.
            </p>
          </div>

          <div className="w-full max-w-md">
            <AuthForm />
          </div>
        </div>
      </div>
    </main>
  );
}
