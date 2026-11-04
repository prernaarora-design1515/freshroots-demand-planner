import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { currentUser, hasRole, ROLES, userCount } from "@/lib/auth";
import { getDb } from "@/db";
import { tickerItems, type TickerItem } from "@/lib/ticker";
import SignOutButton from "@/components/SignOutButton";
import ThemeToggle, { THEME_SCRIPT } from "@/components/ThemeToggle";
import NavLinks from "@/components/NavLinks";
import Motion from "@/components/Motion";

export const metadata: Metadata = {
  title: "Freshroots Demand Planner",
  description: "Twice-weekly reorder recommendations from Raghav's rules, with human approval.",
};

async function session() {
  try {
    const db = await getDb();
    const [user, users, ticker] = await Promise.all([currentUser(db), userCount(db), tickerItems(db)]);
    return { user, needsSetup: users === 0, ticker };
  } catch {
    return { user: null, needsSetup: false, ticker: [] as TickerItem[] };
  }
}

function Ticker({ items }: { items: TickerItem[] }) {
  if (!items.length) return null;
  const tone = { alert: "text-accent", good: "text-emerald-700", muted: "text-gray-500" } as const;
  const list = (hidden: boolean) => (
    <ul aria-hidden={hidden || undefined} className="flex shrink-0 items-center">
      {items.map((it, i) => (
        <li key={i} className="flex items-center gap-2 whitespace-nowrap px-5">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />
          <span className="text-gray-500">{it.label}</span>
          <span className={`font-medium ${it.tone ? tone[it.tone] : "text-ink"}`}>{it.value}</span>
        </li>
      ))}
    </ul>
  );
  return (
    <div className="ticker relative overflow-hidden border-b border-line bg-paper-2/60 font-mono text-[12px]" aria-label="Latest run at a glance">
      <div className="ticker-track flex w-max py-2">
        {list(false)}
        {list(true)}
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-paper to-transparent" />
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-paper to-transparent" />
    </div>
  );
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { user, needsSetup, ticker } = await session();
  const nav = [
    { href: "/", label: "Dashboard" },
    { href: "/results", label: "90-day results" },
    ...(hasRole(user, "planner") ? [{ href: "/upload", label: "Upload data" }] : []),
    { href: "/zoho", label: "Zoho" },
    ...(hasRole(user, "admin") ? [{ href: "/users", label: "Users" }] : []),
  ];
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* App Router root layout: this stylesheet applies to every page. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..700&family=IBM+Plex+Mono:wght@400;500&family=Space+Grotesk:wght@400;500;600&display=swap"
        />
      </head>
      <body className="min-h-screen font-sans antialiased">
        <div aria-hidden className="ruler pointer-events-none fixed inset-y-0 left-0 z-0 hidden w-4 xl:block" />
        <header className="sticky top-0 z-40 border-b border-line bg-paper/80 backdrop-blur-md">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
            <Link href="/" className="group flex items-baseline gap-2">
              <span className="font-display text-xl font-semibold tracking-tight text-ink">
                freshroots<span className="text-accent">.</span>
              </span>
              <span className="hidden font-mono text-[11px] uppercase tracking-wider text-gray-500 transition-colors group-hover:text-ink sm:inline">
                demand planner
              </span>
            </Link>
            <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
              <NavLinks items={nav} />
              <span className="hidden h-4 w-px bg-line sm:block" />
              <ThemeToggle />
              {user ? (
                <span className="flex items-center gap-3">
                  <Link href="/account" className="link-draw text-ink-2 hover:text-ink" title={user.email}>
                    {user.name} <span className="font-mono text-[11px] text-gray-500">· {ROLES[user.role].label}</span>
                  </Link>
                  <SignOutButton />
                </span>
              ) : (
                <Link href="/login" className="press rounded-full bg-ink px-3.5 py-1.5 text-white transition-colors hover:bg-accent">
                  Sign in
                </Link>
              )}
            </nav>
          </div>
          <Motion />
        </header>
        <Ticker items={ticker} />
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
        <main className="relative z-10 mx-auto max-w-7xl px-4 py-6">{children}</main>
        <footer className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 pb-8 pt-4 font-mono text-[11px] text-gray-500">
          <span>Rules decide the numbers · AI explains · a planner approves</span>
          <span className="flex items-center gap-2"><span className="live-dot h-1.5 w-1.5 rounded-full bg-accent" /> MESA Case 01 · Option A</span>
        </footer>
      </body>
    </html>
  );
}
