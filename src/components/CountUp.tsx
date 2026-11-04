"use client";

import { useEffect, useRef, useState } from "react";

/** Counts up to `value` when first scrolled into view. Server render shows the final number. */
export default function CountUp({ value, pad = 0, className }: { value: number; pad?: number; className?: string }) {
  const [n, setN] = useState(value);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches || value <= 0) return;
    let raf = 0;
    const run = () => {
      const start = performance.now();
      const dur = 900 + Math.min(600, value * 8);
      const tick = (t: number) => {
        const p = Math.min(1, (t - start) / dur);
        setN(Math.round(value * (1 - Math.pow(1 - p, 4))));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      setN(0);
      raf = requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        run();
        io.disconnect();
      }
    });
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value]);

  return (
    <span ref={ref} className={className} aria-label={String(value)}>
      <span aria-hidden>{String(n).padStart(pad, "0")}</span>
    </span>
  );
}
