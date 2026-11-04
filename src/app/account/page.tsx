import { redirect } from "next/navigation";
import { currentUser, ROLES } from "@/lib/auth";
import AuthForm from "@/components/AuthForm";
import { isDemoEmail } from "@/lib/demo";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return (
    <div className="mx-auto mt-6 max-w-md space-y-5">
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h1 className="font-display text-2xl font-medium tracking-tight text-ink">{user.name}</h1>
        <p className="text-sm text-gray-600">{user.email}</p>
        <p className="mt-2 text-sm text-gray-700">
          Role: <b>{ROLES[user.role].label}</b> · {ROLES[user.role].can}
        </p>
      </div>
      {isDemoEmail(user.email) ? (
        <p className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-600">
          This is a demo account: it has no password. Use <b>Sign out</b> to switch to another role.
        </p>
      ) : (
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-gray-900">Change password</h2>
        <div className="mt-3">
          <AuthForm
            endpoint="/api/account/password"
            submitLabel="Change password"
            successText="Password changed."
            fields={[
              { name: "current", label: "Current password", type: "password", autoComplete: "current-password" },
              { name: "next", label: "New password", type: "password", autoComplete: "new-password", hint: "10+ characters" },
            ]}
          />
        </div>
      </div>
      )}
    </div>
  );
}
