"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

type Mode = "signin" | "signup";

const authErrorMap: Record<string, string> = {
  CredentialsSignin: "Invalid email or password.",
  OAuthAccountNotLinked:
    "This email is linked to another sign-in method. Use the original provider.",
  AccessDenied: "Access denied.",
};

export default function AuthForm() {
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [providerError, setProviderError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    setProviderError(null);

    try {
      if (mode === "signup") {
        const response = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, password }),
        });
        const data = (await response.json()) as
          | { ok: true; data: { message: string } }
          | { ok: false; error: string };

        if (!response.ok || !data.ok) {
          setError(data.ok ? "Could not create account." : data.error);
          return;
        }

        setMessage("Account created. Signing you in...");
      }

      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError(authErrorMap[result.error] ?? "Invalid email or password.");
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full rounded-2xl border border-white/15 bg-gradient-to-b from-[#0f1738]/95 to-[#0a1028]/95 p-6 shadow-2xl shadow-blue-950/40 backdrop-blur">
      <div className="mb-5 flex rounded-xl bg-white/5 p-1">
        <button
          type="button"
          onClick={() => setMode("signin")}
          className={`w-1/2 rounded-lg px-3 py-2 text-sm font-semibold transition ${
            mode === "signin"
              ? "bg-cyan-400 text-slate-950"
              : "text-slate-300 hover:text-white"
          }`}
        >
          Sign In
        </button>
        <button
          type="button"
          onClick={() => setMode("signup")}
          className={`w-1/2 rounded-lg px-3 py-2 text-sm font-semibold transition ${
            mode === "signup"
              ? "bg-cyan-400 text-slate-950"
              : "text-slate-300 hover:text-white"
          }`}
        >
          Sign Up
        </button>
      </div>

      <form className="space-y-4" onSubmit={onSubmit}>
        {mode === "signup" && (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-300">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full rounded-lg border border-white/15 bg-slate-950/70 px-3 py-2.5 text-sm outline-none ring-cyan-300 transition placeholder:text-slate-500 focus:border-cyan-300/60 focus:ring"
              placeholder="Your name"
            />
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-300">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-lg border border-white/15 bg-slate-950/70 px-3 py-2.5 text-sm outline-none ring-cyan-300 transition placeholder:text-slate-500 focus:border-cyan-300/60 focus:ring"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-300">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className="w-full rounded-lg border border-white/15 bg-slate-950/70 px-3 py-2.5 text-sm outline-none ring-cyan-300 transition placeholder:text-slate-500 focus:border-cyan-300/60 focus:ring"
            placeholder="••••••••"
          />
        </div>

        {error && (
          <p className="rounded-md border border-rose-300/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {error}
          </p>
        )}

        {message && (
          <p className="rounded-md border border-emerald-300/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
            {message}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-gradient-to-r from-cyan-400 to-blue-500 px-4 py-2.5 text-sm font-bold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading
            ? "Please wait..."
            : mode === "signin"
              ? "Sign In"
              : "Create Account"}
        </button>
      </form>

      <div className="my-5 flex items-center gap-3 text-xs text-slate-400">
        <div className="h-px flex-1 bg-white/15" />
        OR CONTINUE WITH
        <div className="h-px flex-1 bg-white/15" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => {
            setProviderError(null);
            void signIn("github", { callbackUrl: "/" }).catch(() => {
              setProviderError("GitHub sign-in failed. Please try again.");
            });
          }}
          className="rounded-lg border border-white/20 bg-white/5 px-3 py-2.5 text-sm font-semibold text-white transition hover:border-cyan-300/60 hover:bg-white/10"
        >
          GitHub
        </button>
        <button
          type="button"
          onClick={() => {
            setProviderError(null);
            void signIn("gitlab", { callbackUrl: "/" }).catch(() => {
              setProviderError("GitLab sign-in failed. Please try again.");
            });
          }}
          className="rounded-lg border border-white/20 bg-white/5 px-3 py-2.5 text-sm font-semibold text-white transition hover:border-cyan-300/60 hover:bg-white/10"
        >
          GitLab
        </button>
      </div>

      {providerError && (
        <p className="mt-4 rounded-md border border-rose-300/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {providerError}
        </p>
      )}
    </div>
  );
}
