"use client";

import { useRouter } from "next/navigation";

export default function SettingsBackButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => router.push("/settings")}
      className="mb-6 inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition hover:bg-muted"
    >
      ← Back to Settings
    </button>
  );
}
