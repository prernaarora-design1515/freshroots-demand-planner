import Link from "next/link";
import HeroLens from "./HeroLens";
import CountUp from "./CountUp";

const ArrowUpRight = () => (
  <svg aria-hidden width="14" height="14" viewBox="0 0 256 256" fill="currentColor">
    <path d="M204,64V168a12,12,0,0,1-24,0V93L72.49,200.49a12,12,0,0,1-17-17L163,76H88a12,12,0,0,1,0-24H192A12,12,0,0,1,204,64Z" />
  </svg>
);
const ArrowDown = () => (
  <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 5v14M6 13l6 6 6-6" />
  </svg>
);

/** Dashboard hero: what this run asks of the planner, at a glance. Purely presentational. */
export default function Hero({
  runId,
  asOf,
  isFestival,
  reorder,
  covered,
  awaiting,
  flagged,
  total,
  canAct,
  nextRun,
}: {
  runId: number;
  asOf: string;
  isFestival: boolean;
  reorder: number;
  covered: number;
  awaiting: number;
  flagged: number;
  total: number;
  canAct: boolean;
  nextRun: string;
}) {
  const stats = [
    { n: reorder, label: "Reorder now", tone: "text-accent" },
    { n: covered, label: "Covered by open POs", tone: "text-emerald-700" },
    { n: awaiting, label: "Awaiting a decision", tone: "text-ink" },
  ];
  return (
    <HeroLens className="-mx-4 mb-8 border-b border-line px-4 pb-10 pt-6 sm:mx-0 sm:rounded-3xl sm:border sm:bg-white/40 sm:px-8 sm:pt-8">
      <div className="grid gap-10 lg:grid-cols-[1.35fr_1fr] lg:items-end">
        <div>
          <p data-reveal className="flex flex-wrap items-center gap-2 font-mono text-xs text-gray-500">
            <span className="live-dot h-2 w-2 rounded-full bg-accent" />
            Run #{runId} · stock as of {asOf}
            {isFestival && <span className="rounded-full border border-line px-2 py-0.5 text-[11px]">festival month · +25%</span>}
            <span className="rounded-full border border-line px-2 py-0.5 text-[11px]">next automatic run {nextRun}</span>
          </p>
          <h1 data-reveal style={{ "--d": 1 } as React.CSSProperties}
            className="mt-4 font-display text-[clamp(2.4rem,5.6vw,4.6rem)] font-medium leading-[0.95] tracking-[-0.035em] text-ink">
            Order what&apos;s needed.
            <span className="block text-gray-400">Not what&apos;s on the way.</span>
          </h1>
          <p data-reveal style={{ "--d": 2 } as React.CSSProperties} className="mt-5 max-w-xl text-[17px] leading-relaxed text-ink-2">
            Raghav&apos;s rules run on the latest SAP export, open Zoho POs are subtracted, and nothing is ordered until a planner approves it.
          </p>
          <div data-reveal style={{ "--d": 3 } as React.CSSProperties} className="mt-7 flex flex-wrap items-center gap-3">
            <a href="#recommendations" className="press group inline-flex items-center gap-3 rounded-full bg-ink py-2 pl-5 pr-2 text-[15px] font-medium text-white">
              {canAct && awaiting ? `Review ${awaiting} line${awaiting === 1 ? "" : "s"}` : "See recommendations"}
              <span className="pill-arrow grid h-8 w-8 place-items-center rounded-full bg-accent text-[#fff]">
                <ArrowDown />
              </span>
            </a>
            <Link href="/results" className="press group inline-flex items-center gap-3 rounded-full border border-line py-2 pl-5 pr-2 text-[15px] font-medium text-ink hover:border-gray-400">
              90-day results
              <span className="pill-arrow grid h-8 w-8 place-items-center rounded-full bg-gray-100 text-ink">
                <ArrowUpRight />
              </span>
            </Link>
          </div>
        </div>

        <ol className="grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-line bg-line lg:grid-cols-1">
          {stats.map((s, i) => (
            <li key={s.label} data-reveal style={{ "--d": i + 2 } as React.CSSProperties}
              className="group flex flex-col justify-between gap-3 bg-paper p-4 transition-colors hover:bg-white lg:flex-row lg:items-end">
              <span className="font-mono text-[11px] text-gray-500">
                <span className="text-accent">0{i + 1}</span> <span aria-hidden>——</span> {s.label}
              </span>
              <span className={`font-display text-4xl font-medium tabular-nums tracking-tight transition-transform duration-500 group-hover:-translate-y-0.5 sm:text-5xl ${s.tone}`}>
                <CountUp value={s.n} pad={2} />
              </span>
            </li>
          ))}
          <li className="hidden bg-paper px-4 py-2 font-mono text-[11px] text-gray-500 lg:block">{flagged} of {total} SKUs flagged this run</li>
        </ol>
      </div>
    </HeroLens>
  );
}
