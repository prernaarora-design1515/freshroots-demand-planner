import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { userCount } from "@/lib/auth";
import { setupCodeConfigured } from "@/lib/users";
import AuthForm from "@/components/AuthForm";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if ((await userCount(await getDb())) > 0) redirect("/login");
  const ready = setupCodeConfigured();
  return (
    <div className="mx-auto mt-10 max-w-md rounded-xl border border-gray-200 bg-white p-6">
      <h1 className="text-lg font-semibold text-ink">Create the first admin</h1>
      <p className="mt-1 text-sm text-gray-600">
        One-time step. The admin then adds planners and viewers on the Users page. This page closes once a user exists.
      </p>
      {ready ? (
        <div className="mt-4">
          <AuthForm
            endpoint="/api/auth/setup"
            submitLabel="Create admin and sign in"
            redirectTo="/users"
            fields={[
              { name: "code", label: "Setup code", type: "password", autoComplete: "off", hint: "the SETUP_CODE you set in Vercel" },
              { name: "name", label: "Your name", autoComplete: "name" },
              { name: "email", label: "Email", type: "email", autoComplete: "username" },
              { name: "password", label: "Password", type: "password", autoComplete: "new-password", hint: "10+ characters" },
            ]}
          />
        </div>
      ) : (
        <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-sm text-gray-700">
          <li>In Vercel, open this project → Settings → Environment Variables.</li>
          <li>Add <code className="rounded bg-gray-100 px-1">SETUP_CODE</code> with any secret phrase of 8+ characters (Production).</li>
          <li>Redeploy, then come back to this page and enter that phrase.</li>
        </ol>
      )}
    </div>
  );
}
