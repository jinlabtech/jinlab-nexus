"use client";

import type { ReactNode } from "react";

import Sidebar from "@/components/Sidebar";
import NexusHelper from "@/components/NexusHelper";
import NexusAppearanceBoot from "@/components/nexus-icons/NexusAppearanceBoot";

type DashboardLayoutProps = {
  children: ReactNode;
};

export default function DashboardLayout({
  children,
}: DashboardLayoutProps) {
  return (
    <div className="min-h-screen bg-muted/30 md:flex md:h-screen md:overflow-hidden">
      <Sidebar />

      <div className="min-w-0 flex-1 md:h-screen md:overflow-y-auto">
        {children}
      </div>
      <NexusAppearanceBoot />
      <NexusHelper />
    </div>
  );
}
