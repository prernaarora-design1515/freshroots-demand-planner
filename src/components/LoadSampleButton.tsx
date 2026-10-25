"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function LoadSampleButton({ variant = "primary" }: { variant?: "primary" | "secondary" }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    startTransition(async () => {
      setError(null);
      const res = await fetch("/api/sample", { method: "POST" }).then((r) => r.json());
      if (!res.ok) return setError(res.error);
      router.push(`/?run=${res.run.id}`);
      router.refresh();
    });

  const cls =
    variant === "primary"
      ? "bg-ink text-white hover:bg-ink/90"
      : "border border-gray-300 bg-white text-gray-800 hover:bg-gray-50";
  return (
    <div>
      <button onClick={load} disabled={busy} className={`rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 ${cls}`}>
        {busy ? "Loading sample data…" : "Load sample data"}
      </button>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
