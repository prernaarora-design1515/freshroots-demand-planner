import { redirect } from "next/navigation";
import { currentUser, ROLES } from "@/lib/auth";
import AuthForm from "@/components/AuthForm";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return (
    <div className="mx-auto mt-6 max-w-md space-y-5">
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h1 className="text-lg font-semibold text-ink">{user.name}</h1>
        <p className="text-sm text-gray-600">{user.email}</p>
        <p className="mt-2 text-sm text-gray-700">
          Role: <b>{ROLES[user.role].label}</b> · {ROLES[user.role].can}
        </p>
      </div>
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
    </div>
  );
}
