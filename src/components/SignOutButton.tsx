"use client";

import { useRouter } from "next/navigation";

export default function SignOutButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/");
        router.refresh();
      }}
      className="rounded-full border border-line px-3 py-1.5 text-ink-2 hover:border-gray-400 hover:text-ink"
    >
      Sign out
    </button>
  );
}
