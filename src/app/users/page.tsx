import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { currentUser, hasRole, ROLES } from "@/lib/auth";
import { listUsers } from "@/lib/users";
import UsersAdmin from "@/components/UsersAdmin";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const db = await getDb();
  const me = await currentUser(db);
  if (!me) redirect("/login");
  if (!hasRole(me, "admin"))
    return <p className="rounded-lg bg-yellow-50 px-3 py-2 text-sm text-yellow-800">Only admins can manage users.</p>;
  const users = (await listUsers(db)).map((u) => ({
    ...u,
    createdAt: u.createdAt.toISOString(),
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
  }));
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-ink">Users</h1>
        <p className="mt-1 text-sm text-gray-600">
          Add the people who use the planner. Give each a temporary password and ask them to change it under their name (top right).
        </p>
        <ul className="mt-2 space-y-0.5 text-xs text-gray-600">
          {Object.values(ROLES).map((r) => (
            <li key={r.label}><b>{r.label}:</b> {r.can}</li>
          ))}
          <li><b>Signed out:</b> read-only view of the dashboard, results and Zoho status</li>
        </ul>
      </div>
      <UsersAdmin users={users} meId={me.id} />
    </div>
  );
}
