"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Acct = { role: "planner" | "admin" | "viewer"; name: string; title: string; blurb: string; label: string };

export default function DemoSignIn({ accounts }: { accounts: Acct[] }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [which, setWhich] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const go = (role: Acct["role"]) => {
    setWhich(role);
    start(async () => {
      setErr(null);
      const j = await fetch("/api/auth/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      }).then((r) => r.json()).catch(() => ({ ok: false, error: "Network error" }));
      if (!j.ok) return setErr(j.error);
      router.push("/");
      router.refresh();
    });
  };

  return (
    <div>
      <ul className="grid gap-3 md:grid-cols-3">
        {accounts.map((a, i) => (
          <li key={a.role} data-reveal style={{ "--d": i } as React.CSSProperties}>
            <button
              onClick={() => go(a.role)}
              disabled={busy}
              className="card-lift group flex h-full w-full flex-col rounded-2xl border border-gray-200 bg-white p-5 text-left disabled:opacity-60"
            >
              <span className="font-mono text-[11px] text-gray-500">
                <span className="text-accent">0{i + 1}</span> —— {a.label}
              </span>
              <span className="mt-3 font-display text-2xl font-medium tracking-tight text-ink">{a.name}</span>
              <span className="text-sm text-gray-500">{a.title}</span>
              <span className="mt-3 flex-1 text-sm leading-relaxed text-ink-2">{a.blurb}</span>
              <span className="mt-5 inline-flex items-center gap-3 self-start rounded-full bg-ink py-1.5 pl-4 pr-1.5 text-sm font-medium text-white">
                {busy && which === a.role ? "Signing in…" : `Continue as ${a.label}`}
                <span className="pill-arrow grid h-7 w-7 place-items-center rounded-full bg-accent text-[#fff]">
                  <svg aria-hidden width="13" height="13" viewBox="0 0 256 256" fill="currentColor"><path d="M204,64V168a12,12,0,0,1-24,0V93L72.49,200.49a12,12,0,0,1-17-17L163,76H88a12,12,0,0,1,0-24H192A12,12,0,0,1,204,64Z" /></svg>
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {err && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
    </div>
  );
}
