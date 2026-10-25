import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { currentUser, userCount } from "@/lib/auth";
import AuthForm from "@/components/AuthForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const db = await getDb();
  if (await currentUser(db)) redirect("/");
  const none = (await userCount(db)) === 0;
  return (
    <div className="mx-auto mt-10 max-w-sm rounded-xl border border-gray-200 bg-white p-6">
      <h1 className="text-lg font-semibold text-ink">Sign in</h1>
      <p className="mt-1 text-sm text-gray-600">Planners and admins sign in to approve orders. Anyone can view read-only.</p>
      {none ? (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          No users exist yet. The project owner creates the first admin on the <Link href="/setup" className="underline">setup page</Link>.
        </p>
      ) : (
        <div className="mt-4">
          <AuthForm
            endpoint="/api/auth/login"
            submitLabel="Sign in"
            redirectTo="/"
            fields={[
              { name: "email", label: "Email", type: "email", autoComplete: "username" },
              { name: "password", label: "Password", type: "password", autoComplete: "current-password" },
            ]}
          />
          <p className="mt-3 text-xs text-gray-500">Forgot your password? Ask an admin to reset it on the Users page.</p>
        </div>
      )}
    </div>
  );
}
