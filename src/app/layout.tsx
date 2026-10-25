import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Freshroots Demand Planner",
  description: "Twice-weekly reorder recommendations from Raghav's rules, with human approval.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">
        <header className="bg-ink text-white">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
            <Link href="/" className="font-semibold tracking-tight">
              Freshroots <span className="font-normal text-white/60">· Demand Planner</span>
            </Link>
            <nav className="flex gap-5 text-sm text-white/80">
              <Link href="/" className="hover:text-white">Dashboard</Link>
              <Link href="/upload" className="hover:text-white">Upload data</Link>
              <Link href="/zoho" className="hover:text-white">Zoho</Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
