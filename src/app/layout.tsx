import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { currentUser, hasRole, ROLES, userCount } from "@/lib/auth";
import { getDb } from "@/db";
import SignOutButton from "@/components/SignOutButton";

export const metadata: Metadata = {
  title: "Freshroots Demand Planner",
  description: "Twice-weekly reorder recommendations from Raghav's rules, with human approval.",
};

async function session() {
  try {
    const db = await getDb();
    const [user, users] = await Promise.all([currentUser(db), userCount(db)]);
    return { user, needsSetup: users === 0 };
  } catch {
    return { user: null, needsSetup: false };
  }
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { user, needsSetup } = await session();
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">
        <header className="bg-ink text-white">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
            <Link href="/" className="font-semibold tracking-tight">
              Freshroots <span className="font-normal text-white/60">· Demand Planner</span>
            </Link>
            <nav className="flex flex-wrap items-center gap-5 text-sm text-white/80">
              <Link href="/" className="hover:text-white">Dashboard</Link>
              <Link href="/results" className="hover:text-white">90-day results</Link>
              {hasRole(user, "planner") && <Link href="/upload" className="hover:text-white">Upload data</Link>}
              <Link href="/zoho" className="hover:text-white">Zoho</Link>
              {hasRole(user, "admin") && <Link href="/users" className="hover:text-white">Users</Link>}
              <span className="hidden h-4 w-px bg-white/25 sm:block" />
              {user ? (
                <span className="flex items-center gap-3">
                  <Link href="/account" className="hover:text-white" title={user.email}>
                    {user.name} <span className="text-white/50">· {ROLES[user.role].label}</span>
                  </Link>
                  <SignOutButton />
                </span>
              ) : (
                <Link href="/login" className="rounded-md bg-white/10 px-2.5 py-1 hover:bg-white/20">Sign in</Link>
              )}
            </nav>
          </div>
        </header>
        {!user && (
          <div className="border-b border-amber-200 bg-amber-50">
            <p className="mx-auto max-w-7xl px-4 py-1.5 text-xs text-amber-900">
              {needsSetup ? (
                <>Read-only view. No users yet: the project owner sets up the first admin at <Link href="/setup" className="underline">/setup</Link>.</>
              ) : (
                <>You&apos;re viewing read-only. <Link href="/login" className="underline">Sign in</Link> to upload data, approve orders or send them to Zoho.</>
              )}
            </p>
          </div>
        )}
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
