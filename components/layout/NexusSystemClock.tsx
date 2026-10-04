"use client";

import { useEffect, useState } from "react";

export default function NexusSystemClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const update = () => setNow(new Date());

    update();

    const timer = window.setInterval(update, 1000);

    return () => window.clearInterval(timer);
  }, []);

  if (!now) {
    return <div className="h-5 w-28 rounded bg-muted/40" />;
  }

  const time = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);

  const date = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(now);

  return (
    <div
      className="flex items-center justify-center gap-2 whitespace-nowrap text-center tabular-nums"
      title={Intl.DateTimeFormat().resolvedOptions().timeZone}
    >
      <span className="hidden text-xs font-medium text-muted-foreground sm:inline">
        {date}
      </span>

      <span className="hidden text-muted-foreground/40 sm:inline">
        •
      </span>

      <span className="text-sm font-semibold tracking-[0.08em]">
        {time}
      </span>
    </div>
  );
}
