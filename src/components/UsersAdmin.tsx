"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type U = { id: number; name: string; email: string; role: string; active: boolean; createdAt: string; lastLoginAt: string | null };

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "never";

export default function UsersAdmin({ users, meId }: { users: U[]; meId: number }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [resetFor, setResetFor] = useState<number | null>(null);

  const call = (method: "POST" | "PATCH", body: object, okText: string, after?: () => void) =>
    start(async () => {
      setMsg(null);
      const j = await fetch("/api/users", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => r.json());
      if (!j.ok) return setMsg({ ok: false, text: j.error });
      setMsg({ ok: true, text: okText });
      after?.();
      router.refresh();
    });

  const add = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const d = Object.fromEntries(new FormData(form).entries());
    call("POST", d, `Added ${d.name}. Share the temporary password with them privately.`, () => form.reset());
  };

  return (
    <div className="space-y-5">
      {msg && <p className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{msg.text}</p>}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr><th className="px-3 py-2.5">Name</th><th className="px-3 py-2.5">Role</th><th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5">Last sign-in</th><th className="px-3 py-2.5">Actions</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map((u) => (
              <tr key={u.id} className={`align-top ${u.active ? "" : "text-gray-400"}`}>
                <td className="px-3 py-2.5">
                  <div className="font-medium">{u.name}{u.id === meId && <span className="ml-1 text-xs text-gray-500">(you)</span>}</div>
                  <div className="text-xs text-gray-500">{u.email}</div>
                </td>
                <td className="px-3 py-2.5">
                  <select
                    value={u.role}
                    disabled={busy}
                    aria-label={`Role for ${u.name}`}
                    onChange={(e) => call("PATCH", { id: u.id, role: e.target.value }, `${u.name} is now ${e.target.value}.`)}
                    className="rounded border border-gray-300 px-1.5 py-1"
                  >
                    <option value="admin">Admin</option>
                    <option value="planner">Planner</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </td>
                <td className="px-3 py-2.5">{u.active ? "Active" : "Deactivated"}</td>
                <td className="px-3 py-2.5 text-gray-600">{fmt(u.lastLoginAt)}</td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap gap-1.5">
                    {u.id !== meId && (
                      <button
                        disabled={busy}
                        onClick={() => call("PATCH", { id: u.id, active: !u.active }, `${u.name} ${u.active ? "deactivated" : "reactivated"}.`)}
                        className="rounded-md border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
                      >
                        {u.active ? "Deactivate" : "Reactivate"}
                      </button>
                    )}
                    <button onClick={() => setResetFor(resetFor === u.id ? null : u.id)} className="rounded-md border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50">
                      Reset password
                    </button>
                  </div>
                  {resetFor === u.id && (
                    <form
                      className="mt-2 flex gap-1.5"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const pw = String(new FormData(e.currentTarget).get("password") ?? "");
                        call("PATCH", { id: u.id, password: pw }, `Password reset for ${u.name}. They've been signed out.`, () => setResetFor(null));
                      }}
                    >
                      <input name="password" type="password" autoComplete="new-password" placeholder="New temporary password (10+)" required className="w-56 rounded border border-gray-300 px-2 py-1 text-xs" />
                      <button disabled={busy} className="rounded-md bg-ink px-2 py-1 text-xs text-white">Save</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form onSubmit={add} className="grid gap-3 rounded-xl border border-gray-200 bg-white p-5 sm:grid-cols-2">
        <h2 className="text-sm font-semibold text-gray-900 sm:col-span-2">Add a user</h2>
        <label className="text-sm">Name<input name="name" required className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2" /></label>
        <label className="text-sm">Email<input name="email" type="email" required autoComplete="off" className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2" /></label>
        <label className="text-sm">
          Role
          <select name="role" defaultValue="planner" className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2">
            <option value="planner">Planner</option>
            <option value="viewer">Viewer</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <label className="text-sm">Temporary password<input name="password" type="password" required minLength={10} autoComplete="new-password" className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2" /></label>
        <div className="sm:col-span-2">
          <button disabled={busy} className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{busy ? "Working…" : "Add user"}</button>
        </div>
      </form>
    </div>
  );
}
