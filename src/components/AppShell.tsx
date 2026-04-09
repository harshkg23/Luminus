"use client";

import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import Sidebar from "./Sidebar";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/" || pathname?.startsWith("/auth")) return <>{children}</>;
  /* All protected routes get sidebar + layout */
  return <ProtectedShell>{children}</ProtectedShell>;
}

function ProtectedShellFullWidth({ children }: { children: React.ReactNode }) {
  const { status } = useSession({ required: true });

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-base flex items-center justify-center">
        <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center">
          <span className="material-symbols-outlined text-accent animate-spin" style={{ fontSize: "22px" }}>
            progress_activity
          </span>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function ProtectedShell({ children }: { children: React.ReactNode }) {
  const { status } = useSession({ required: true });

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-base flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center">
            <span
              className="material-symbols-outlined text-accent animate-spin"
              style={{ fontSize: "22px" }}
            >
              progress_activity
            </span>
          </div>
          <p className="font-mono text-[10px] text-fg-3 uppercase tracking-widest">
            Authenticating…
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Sidebar />
      <div className="ml-64 flex flex-col min-h-screen">{children}</div>
    </>
  );
}
