"use client";

import type { ReactNode } from "react";
import { useState, useRef, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { useTheme } from "./ThemeProvider";

interface TopBarProps {
  center?: ReactNode;
  activeLabel?: string;
}

export default function TopBar({ center, activeLabel }: TopBarProps) {
  const { theme, toggle } = useTheme();
  const { data: session } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const userName = session?.user?.name ?? session?.user?.email ?? "User";
  const initials = userName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <header
      className="sticky top-0 z-50 w-full h-14 flex items-center justify-between px-6
                 bg-surface/80 backdrop-blur-xl
                 border-b border-[var(--bd)]
                 shadow-[0_1px_20px_rgba(0,0,0,0.06)]"
    >
      {/* Left */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-fg-3 font-mono text-xs">
          <span
            className="material-symbols-outlined text-accent"
            style={{ fontSize: "14px" }}
          >
            bolt
          </span>
          System Health: Optimal
        </div>
        {activeLabel && (
          <>
            <div className="h-3 w-px bg-[var(--bd-2)]" />
            <span className="text-accent font-mono text-[11px] uppercase tracking-widest font-bold">
              {activeLabel}
            </span>
          </>
        )}
      </div>

      {/* Center */}
      {center && <div className="flex-1 flex justify-center px-8">{center}</div>}

      {/* Right */}
      <div className="flex items-center gap-1">
        {/* Theme toggle */}
        <button
          onClick={toggle}
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          className="p-2 rounded-lg text-fg-3 hover:text-accent hover:bg-[var(--accent-soft)] transition-all"
        >
          <span className="material-symbols-outlined" style={{ fontSize: "19px" }}>
            {theme === "dark" ? "light_mode" : "dark_mode"}
          </span>
        </button>

        {/* Avatar + dropdown */}
        <div className="relative ml-4 flex items-center gap-3">
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-mono font-bold text-neg hover:bg-neg/10 transition-colors"
          >
            <span className="material-symbols-outlined" style={{ fontSize: "15px" }}>logout</span>
            Logout
          </button>

          <button
            title={userName}
            className="w-7 h-7 rounded-full bg-[var(--accent-soft)] border border-[var(--bd-2)] flex items-center justify-center font-mono text-[9px] font-bold text-accent hover:border-accent hover:bg-accent/20 transition-all cursor-default"
          >
            {initials}
          </button>
        </div>
      </div>
    </header>
  );
}
