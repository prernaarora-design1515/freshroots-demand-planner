"use client";

import { useRef } from "react";

/** Wraps the hero: a soft accent "lens" follows the cursor over a dotted grid. */
export default function HeroLens({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
  };
  return (
    <div ref={ref} onPointerMove={move} className={`relative overflow-hidden ${className}`}>
      <div aria-hidden className="dot-grid pointer-events-none absolute inset-0" />
      <div aria-hidden className="lens pointer-events-none absolute inset-0" />
      <div className="relative">{children}</div>
    </div>
  );
}
