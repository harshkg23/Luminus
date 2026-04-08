"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const oauthProviders = [
  {
    id: "github",
    label: "Sign up with GitHub",
    icon: (
      <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden>
        <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
      </svg>
    ),
  },
  {
    id: "google",
    label: "Sign up with Google",
    icon: (
      <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden>
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>
    ),
  },
  {
    id: "gitlab",
    label: "Sign up with GitLab",
    icon: (
      <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current text-[#FC6D26]" aria-hidden>
        <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 0 1-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 0 1 4.82 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0 1 18.6 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.51L23 13.45a.84.84 0 0 1-.35.94z"/>
      </svg>
    ),
  },
];

export default function SignUpPage() {
  const router = useRouter();

  const [name, setName]         = useState("");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      setLoading(false);
      setError(data.error ?? "Registration failed.");
      return;
    }

    // Auto sign-in after registration
    const signInRes = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);

    if (signInRes?.error) {
      router.push("/auth/signin");
    } else {
      router.push("/");
    }
  }

  const strength =
    password.length === 0 ? 0
    : password.length < 8 ? 1
    : password.length < 12 ? 2
    : 3;

  const strengthLabel = ["", "Weak", "Good", "Strong"];
  const strengthColor = ["", "bg-error", "bg-yellow-500", "bg-green-500"];

  return (
    <div className="min-h-screen bg-[#050508] flex items-center justify-center px-4 relative overflow-hidden">
      {/* Background grid */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: "linear-gradient(#00f5ff 1px, transparent 1px), linear-gradient(90deg, #00f5ff 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />
      <div className="absolute top-1/3 right-1/4 w-96 h-96 rounded-full bg-[#00f5ff]/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/3 left-1/4 w-64 h-64 rounded-full bg-secondary/5 blur-[100px] pointer-events-none" />

      <div className="relative w-full max-w-sm z-10">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2.5 mb-4">
            <span
              className="material-symbols-outlined text-[#00f5ff]"
              style={{ fontVariationSettings: "'FILL' 1", fontSize: "28px" }}
            >
              terminal
            </span>
            <span className="font-mono text-xl font-black uppercase tracking-widest text-[#00f5ff]">
              tollGate
            </span>
          </div>
          <p className="font-mono text-[10px] text-[#b9caca]/40 uppercase tracking-widest">
            Create your account
          </p>
        </div>

        {/* Card */}
        <div className="glass-panel rounded-2xl p-8 shadow-[0_0_60px_rgba(0,245,255,0.05)]">
          <h1 className="font-headline text-xl font-bold text-on-surface mb-1">Register</h1>
          <p className="font-mono text-[10px] text-[#b9caca]/40 uppercase tracking-widest mb-7">
            Join the command center
          </p>

          {/* OAuth */}
          <div className="space-y-2.5 mb-6">
            {oauthProviders.map((p) => (
              <button
                key={p.id}
                onClick={() => signIn(p.id, { callbackUrl: "/" })}
                className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 font-mono text-[11px] uppercase tracking-widest text-on-surface transition-all"
              >
                {p.icon}
                {p.label}
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-px bg-white/5" />
            <span className="font-mono text-[9px] text-[#b9caca]/25 uppercase tracking-widest">
              or with email
            </span>
            <div className="flex-1 h-px bg-white/5" />
          </div>

          {/* Form */}
          <form onSubmit={handleRegister} className="space-y-3">
            {error && (
              <div className="flex items-center gap-2 bg-error-container/20 border border-error-container/40 px-3 py-2 rounded-lg">
                <span className="material-symbols-outlined text-error" style={{ fontSize: "14px" }}>error</span>
                <p className="font-mono text-[10px] text-error">{error}</p>
              </div>
            )}

            <div>
              <label className="font-mono text-[9px] text-[#b9caca]/40 uppercase tracking-widest block mb-1.5">
                Full Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Ada Lovelace"
                className="w-full bg-white/3 border border-white/8 rounded-lg px-3 py-2.5 font-mono text-xs text-on-surface placeholder:text-[#b9caca]/20 focus:outline-none focus:border-[#00f5ff]/40 focus:ring-1 focus:ring-[#00f5ff]/20 transition-all"
              />
            </div>

            <div>
              <label className="font-mono text-[9px] text-[#b9caca]/40 uppercase tracking-widest block mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                className="w-full bg-white/3 border border-white/8 rounded-lg px-3 py-2.5 font-mono text-xs text-on-surface placeholder:text-[#b9caca]/20 focus:outline-none focus:border-[#00f5ff]/40 focus:ring-1 focus:ring-[#00f5ff]/20 transition-all"
              />
            </div>

            <div>
              <label className="font-mono text-[9px] text-[#b9caca]/40 uppercase tracking-widest block mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="Min. 8 characters"
                  className="w-full bg-white/3 border border-white/8 rounded-lg px-3 py-2.5 pr-10 font-mono text-xs text-on-surface placeholder:text-[#b9caca]/20 focus:outline-none focus:border-[#00f5ff]/40 focus:ring-1 focus:ring-[#00f5ff]/20 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-2.5 text-[#b9caca]/25 hover:text-[#00dce5] transition-colors"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
                    {showPw ? "visibility_off" : "visibility"}
                  </span>
                </button>
              </div>

              {/* Strength bar */}
              {password.length > 0 && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex gap-1 flex-1">
                    {[1, 2, 3].map((s) => (
                      <div
                        key={s}
                        className={`h-0.5 flex-1 rounded-full transition-all ${s <= strength ? strengthColor[strength] : "bg-white/5"}`}
                      />
                    ))}
                  </div>
                  <span className={`font-mono text-[9px] uppercase tracking-widest ${strength === 1 ? "text-error" : strength === 2 ? "text-yellow-500" : "text-green-400"}`}>
                    {strengthLabel[strength]}
                  </span>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-1 py-2.5 bg-[#00f5ff] text-[#003739] font-mono font-bold text-[11px] uppercase tracking-widest rounded-lg hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="material-symbols-outlined animate-spin" style={{ fontSize: "16px" }}>progress_activity</span>
                  Creating account...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>person_add</span>
                  Create Account
                </>
              )}
            </button>
          </form>
        </div>

        {/* Sign-in link */}
        <p className="text-center font-mono text-[10px] text-[#b9caca]/30 mt-6">
          Already have an account?{" "}
          <Link href="/auth/signin" className="text-[#00dce5] hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
