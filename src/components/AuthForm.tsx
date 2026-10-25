"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Field = { name: string; label: string; type?: string; autoComplete?: string; hint?: string };

/** Small JSON form used by sign-in, first-run setup and change-password. */
export default function AuthForm({
  endpoint,
  fields,
  submitLabel,
  redirectTo,
  successText,
}: {
  endpoint: string;
  fields: Field[];
  submitLabel: string;
  redirectTo?: string;
  successText?: string;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const body = Object.fromEntries(new FormData(form).entries());
    start(async () => {
      setMsg(null);
      const j = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => r.json()).catch(() => ({ ok: false, error: "Network error" }));
      if (!j.ok) return setMsg({ ok: false, text: j.error });
      form.reset();
      if (successText) setMsg({ ok: true, text: successText });
      if (redirectTo) {
        router.push(redirectTo);
        router.refresh();
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {fields.map((f) => (
        <label key={f.name} className="block text-sm">
          <span className="font-medium text-gray-800">{f.label}</span>
          {f.hint && <span className="ml-2 text-xs text-gray-500">{f.hint}</span>}
          <input
            name={f.name}
            type={f.type ?? "text"}
            autoComplete={f.autoComplete}
            required
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2"
          />
        </label>
      ))}
      {msg && <p className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{msg.text}</p>}
      <button disabled={busy} className="w-full rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
        {busy ? "Working…" : submitLabel}
      </button>
    </form>
  );
}
