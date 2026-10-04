"use client";

/*
 * Nexus Shell 2.0 compatibility boundary.
 *
 * Older Nexus modules still render <DashboardLayout>.
 * The persistent application shell now lives in app/layout.tsx,
 * so this component intentionally renders only its workspace.
 *
 * This allows us to migrate hundreds of existing pages safely
 * without editing every module at once.
 */

type DashboardLayoutProps = {
  children: React.ReactNode;
};


export default function DashboardLayout({
  children,
}: DashboardLayoutProps) {

  return (
    <>
      {children}
    </>
  );
}
