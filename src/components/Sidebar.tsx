"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";

const navItems = [
  { href: "/dashboard", icon: "dashboard",    label: "Dashboard" },
  { href: "/repos",     icon: "database",     label: "Repos"     },
  { href: "/metrics",   icon: "analytics",    label: "Metrics"   },
  { href: "/pricing",   icon: "payments",     label: "Pricing"   },
  { href: "/settings",  icon: "settings",     label: "Settings"  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();

  const initials = session?.user?.name
    ? session.user.name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
    : "AB";

  return (
    <aside
      className="fixed left-0 top-0 h-full w-64 flex flex-col pb-5 px-3 z-40
                 bg-surface border-r border-[var(--bd)]
                 transition-colors duration-200"
    >
      {/* Logo */}
      <div className="h-14 flex items-center px-3 border-b border-[var(--bd)] mb-4">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center shadow-[0_0_12px_var(--accent-soft)]">
            <span
              className="material-symbols-outlined text-white"
              style={{ fontVariationSettings: "'FILL' 1", fontSize: "16px" }}
            >
              terminal
            </span>
          </div>
          <div>
            <span className="font-headline text-sm font-bold text-fg-1 tracking-tight block leading-none">
              tollGate
            </span>
            <span className="font-mono text-[9px] text-fg-3 uppercase tracking-widest">
              AI Co-Pilot v2.4
            </span>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5">
        {navItems.map(({ href, icon, label }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg font-mono text-[11px] uppercase tracking-widest transition-all duration-150 ${
                isActive
                  ? "nav-active font-bold"
                  : "text-fg-3 hover:bg-[var(--accent-soft)] hover:text-accent"
              }`}
            >
              <span className="material-symbols-outlined" style={{ fontSize: "17px" }}>
                {icon}
              </span>
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Deploy CTA */}
      <div className="space-y-3 pt-3 border-t border-[var(--bd)]">
        <button className="w-full kinetic-gradient text-white py-2.5 rounded-lg font-mono font-bold text-[11px] uppercase tracking-tighter hover:opacity-90 active:scale-95 transition-all shadow-[0_4px_15px_var(--accent-soft)]">
          Deploy Agent
        </button>

        {/* User row */}
        <div className="flex items-center gap-2.5 px-1 pt-2 border-t border-[var(--bd)]">
          {session?.user?.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={session.user.image}
              alt="avatar"
              className="w-7 h-7 rounded-full border border-[var(--bd-2)] object-cover shrink-0"
            />
          ) : (
            <div className="w-7 h-7 rounded-full bg-[var(--accent-soft)] border border-[var(--bd-2)] flex items-center justify-center font-mono text-[9px] font-bold text-accent shrink-0">
              {initials}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-mono text-[10px] text-fg-2 truncate leading-none">
              {session?.user?.name ?? "User"}
            </p>
            <p className="font-mono text-[9px] text-fg-4 truncate mt-0.5">
              {session?.user?.email ?? ""}
            </p>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/auth/signin" })}
            className="text-fg-4 hover:text-neg transition-colors shrink-0"
            title="Sign out"
          >
            <span className="material-symbols-outlined" style={{ fontSize: "15px" }}>
              logout
            </span>
          </button>
        </div>
      </div>
    </aside>
  );
}
