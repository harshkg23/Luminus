import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard — Luminus · TollGate",
  description: "Real-time multi-agent pipeline (control plane + sample-dashboard-app)",
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
