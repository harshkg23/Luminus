"use client";

import { useState } from "react";
import Link from "next/link";

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    badge: "For small teams",
    priceMonthly: 5,
    priceYearly: 4,
    description: "Perfect for trying TollGate on a single critical application.",
    highlight: "1 AI agent · great for pilots and side‑projects.",
    features: [
      "1 core TollGate agent (Architect or Scripter)",
      "Up to 2 connected repos",
      "3k pipeline runs / month",
      "GitHub integration",
      "Email support",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    badge: "Most popular",
    priceMonthly: 25,
    priceYearly: 20,
    description: "Turn your CI into an autonomous QA pipeline with a squad of agents.",
    highlight: "Architect + Scripter + Watchdog, tuned for product teams.",
    features: [
      "3 coordinated agents (Architect, Scripter, Watchdog)",
      "Unlimited connected repos",
      "20k pipeline runs / month",
      "Automatic flaky‑test detection",
      "Slack notifications & RCA summaries",
      "Priority support",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    badge: "For large orgs",
    priceMonthly: 100,
    priceYearly: 80,
    description: "A full agent grid with guardrails, governance, and custom integrations.",
    highlight: "All 5 agents (including Healer & Courier) plus custom MCPs.",
    features: [
      "Up to 15 TollGate agents across squads",
      "Unlimited pipeline runs",
      "Custom MCP & data‑plane integrations",
      "Fine‑grained policy & approval workflows",
      "Dedicated solutions engineer",
      "SLA‑backed support & SSO",
    ],
  },
] as const;

export default function PricingPage() {
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

  return (
    <div className="flex-1 overflow-auto bg-background terminal-scroll">
      <div className="max-w-6xl mx-auto px-4 py-10 md:py-14">
        {/* Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-10">
          <div>
            <p className="inline-flex items-center gap-2 text-xs font-mono font-bold px-3 py-1.5 rounded-lg border border-border bg-muted text-muted-foreground mb-4 uppercase tracking-widest">
              <span className="pulse-indicator" />
              Agents online · 5/5
            </p>
            <h1 className="text-2xl md:text-3xl font-headline font-bold text-foreground tracking-tight mb-2">
              Choose the right TollGate subscription
            </h1>
            <p className="text-sm text-muted-foreground max-w-xl font-mono">
              Start small with a single agent or roll out a full multi‑agent grid that writes, heals, and observes your tests across every repo.
            </p>
          </div>
          <div className="hidden md:flex flex-col items-end gap-2 text-xs text-muted-foreground font-mono">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-secondary" />
              Live workspace pricing
            </span>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1 text-primary hover:text-primary/80 transition-colors"
            >
              Open dashboard
              <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>
                arrow_forward
              </span>
            </Link>
          </div>
        </div>

        {/* Billing toggle */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
            <span className="material-symbols-outlined text-primary" style={{ fontSize: "16px" }}>
              smart_toy
            </span>
            <span>Pricing is per workspace — unlimited human users.</span>
          </div>
          <div className="inline-flex items-center rounded-lg border border-border/50 bg-muted/40 p-1 text-xs font-mono font-bold uppercase tracking-wider">
            <button
              onClick={() => setBilling("monthly")}
              className={`px-4 py-2 rounded-md transition-colors ${
                billing === "monthly"
                  ? "bg-surface text-foreground shadow-sm border border-border/50"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBilling("yearly")}
              className={`px-4 py-2 rounded-md transition-colors flex items-center gap-2 ${
                billing === "yearly"
                  ? "bg-surface text-foreground shadow-sm border border-border/50"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Yearly
              <span className="text-[10px] text-pos">Save 20%</span>
            </button>
          </div>
        </div>

        {/* Plans grid */}
        <div className="grid md:grid-cols-3 gap-5 mb-10">
          {PLANS.map((plan) => {
            const price = billing === "monthly" ? plan.priceMonthly : plan.priceYearly;
            const suffix = billing === "monthly" ? "/mo" : "/mo billed yearly";
            const isSelected = selectedPlanId === plan.id;

            return (
              <div
                key={plan.id}
                className={`relative rounded-xl p-5 flex flex-col h-full transition-all duration-300 ${
                  isSelected
                    ? "glass-strong border-primary/60 glow-cyan box-border transform scale-[1.02]"
                    : "glass border-border/50 hover:border-border"
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-5">
                  <div>
                    <p className="inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded border border-border/40 bg-muted/60 text-muted-foreground uppercase tracking-widest mb-3">
                      {plan.badge}
                    </p>
                    <h2 className="text-xl font-headline font-bold text-foreground mb-1">
                      {plan.name}
                    </h2>
                    <p className="text-xs text-muted-foreground font-mono h-10">
                      {plan.description}
                    </p>
                  </div>
                  {plan.id === "growth" && (
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded border border-pos bg-pos/10 text-pos uppercase tracking-widest">
                      Recommended
                    </span>
                  )}
                </div>

                <div className="mb-6">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-4xl font-headline font-black tracking-tighter text-foreground">
                      ${price}
                    </span>
                    <span className="text-xs text-muted-foreground font-mono">
                      {suffix}
                    </span>
                  </div>
                  <p className="text-[11px] font-mono text-pos mt-2 h-8">
                    {plan.highlight}
                  </p>
                </div>

                <div className="space-y-3 text-xs text-foreground/80 mb-6 font-mono flex-1">
                  {plan.features.map((feature) => (
                    <div key={feature} className="flex items-start gap-2.5">
                      <span className="material-symbols-outlined text-pos shrink-0 mt-[1px]" style={{ fontSize: "14px", fontVariationSettings: "'wght' 600" }}>
                        check_circle
                      </span>
                      <span className="leading-snug">{feature}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-auto pt-4 border-t border-border/30">
                  <button
                    onClick={() => setSelectedPlanId(plan.id)}
                    className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-mono text-[11px] font-bold uppercase tracking-widest transition-all ${
                      isSelected
                        ? "bg-primary text-white shadow-[0_0_15px_var(--accent-soft)] hover:opacity-90"
                        : "bg-surface border border-border text-foreground hover:bg-muted"
                    }`}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
                      bolt
                    </span>
                    Select {plan.name}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
