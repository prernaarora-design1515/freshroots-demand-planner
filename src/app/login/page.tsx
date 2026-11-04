import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { currentUser, ROLES, userCount } from "@/lib/auth";
import { DEMO_ACCOUNTS, demoMode } from "@/lib/demo";
import AuthForm from "@/components/AuthForm";
import DemoSignIn from "@/components/DemoSignIn";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const db = await getDb();
  if (await currentUser(db)) redirect("/");
  const demo = demoMode();
  const none = (await userCount(db)) === 0;

  const passwordForm = (
    <AuthForm
      endpoint="/api/auth/login"
      submitLabel="Sign in"
      redirectTo="/"
      fields={[
        { name: "email", label: "Email", type: "email", autoComplete: "username" },
        { name: "password", label: "Password", type: "password", autoComplete: "current-password" },
      ]}
    />
  );

  if (demo) {
    const order = ["planner", "admin", "viewer"] as const;
    return (
      <div className="mx-auto max-w-5xl py-4">
        <p data-reveal className="font-mono text-xs text-gray-500">Sign in · no password needed</p>
        <h1 data-reveal style={{ "--d": 1 } as React.CSSProperties} className="mt-2 font-display text-[clamp(2.2rem,5vw,3.6rem)] font-medium leading-[1] tracking-[-0.03em] text-ink">
          Pick a role to try.
        </h1>
        <p data-reveal style={{ "--d": 2 } as React.CSSProperties} className="mt-3 max-w-2xl text-ink-2">
          Each account shows what that person can and can&apos;t do. Switch any time with <b>Sign out</b>.
          Approvals and Zoho sends are real: drafts land in the Freshroots Zoho Inventory test organization.
        </p>
        <div className="mt-8">
          <DemoSignIn accounts={order.map((r) => ({ role: r, label: ROLES[r].label, ...DEMO_ACCOUNTS[r] }))} />
        </div>
        <details className="mt-8 max-w-sm text-sm">
          <summary className="cursor-pointer text-gray-500 hover:text-ink">Sign in with an email and password instead</summary>
          <div className="mt-3 rounded-xl border border-gray-200 bg-white p-5">{passwordForm}</div>
        </details>
      </div>
    );
  }

  return (
    <div className="mx-auto mt-10 max-w-sm rounded-xl border border-gray-200 bg-white p-6">
      <h1 className="font-display text-2xl font-medium tracking-tight text-ink">Sign in</h1>
      <p className="mt-1 text-sm text-gray-600">Planners and admins sign in to approve orders. Anyone can view read-only.</p>
      {none ? (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          No users exist yet. The project owner creates the first admin on the <Link href="/setup" className="underline">setup page</Link>.
        </p>
      ) : (
        <div className="mt-4">
          {passwordForm}
          <p className="mt-3 text-xs text-gray-500">Forgot your password? Ask an admin to reset it on the Users page.</p>
        </div>
      )}
    </div>
  );
}
