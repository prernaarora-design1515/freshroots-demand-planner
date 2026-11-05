import { redirect } from "next/navigation";
import { currentUser, ROLES } from "@/lib/auth";
import { ACCOUNTS } from "@/lib/accounts";
import RoleSignIn from "@/components/RoleSignIn";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await currentUser()) redirect("/");
  const order = ["planner", "admin", "viewer"] as const;
  return (
    <div className="mx-auto max-w-5xl py-4">
      <p data-reveal className="font-mono text-xs text-gray-500">Sign in · one click, no password</p>
      <h1 data-reveal style={{ "--d": 1 } as React.CSSProperties} className="mt-2 font-display text-[clamp(2.2rem,5vw,3.6rem)] font-medium leading-[1] tracking-[-0.03em] text-ink">
        Who&apos;s planning today?
      </h1>
      <p data-reveal style={{ "--d": 2 } as React.CSSProperties} className="mt-3 max-w-2xl text-ink-2">
        Each role shows what that person can and can&apos;t do. Switch any time with <b>Sign out</b>.
        Approvals and Zoho sends are real: drafts land in the Freshroots Zoho Inventory test organization.
      </p>
      <div className="mt-8">
        <RoleSignIn accounts={order.map((r) => ({ role: r, label: ROLES[r].label, ...ACCOUNTS[r] }))} />
      </div>
    </div>
  );
}
