"use client";

import {
  usePathname,
} from "next/navigation";

export default function NexusPageMotion({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname =
    usePathname();

  return (
    <div
      key={pathname}
      className="nexus-page-enter"
      data-nexus-route={pathname}
    >
      {children}
    </div>
  );
}
