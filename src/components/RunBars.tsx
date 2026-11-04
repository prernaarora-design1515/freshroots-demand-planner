/** Single-series bar chart, one bar per run. Server-rendered SVG; hover shows the exact value. */
export default function RunBars({
  title,
  data,
  fmt,
}: {
  title: string;
  data: { label: string; sub: string; value: number }[];
  fmt: (n: number) => string;
}) {
  const w = 520, h = 150, padL = 8, padB = 22, padT = 18;
  const max = Math.max(1, ...data.map((d) => d.value));
  const slot = (w - padL * 2) / Math.max(1, data.length);
  const bw = Math.min(36, slot * 0.6);
  const y = (v: number) => padT + (h - padT - padB) * (1 - v / max);
  const showEvery = Math.ceil(data.length / 12);
  return (
    <figure data-reveal className="card-lift rounded-xl border border-gray-200 bg-white p-4">
      <figcaption className="text-sm font-medium text-gray-900">{title}</figcaption>
      <svg viewBox={`0 0 ${w} ${h}`} className="mt-2 w-full text-ink" role="img" aria-label={`${title}: ${data.map((d) => `${d.label} ${fmt(d.value)}`).join(", ")}`}>
        <line x1={padL} x2={w - padL} y1={h - padB} y2={h - padB} stroke="var(--color-gray-300)" />
        {data.map((d, i) => {
          const cx = padL + slot * i + slot / 2;
          const top = y(d.value);
          const barH = Math.max(0, h - padB - top);
          return (
            <g key={d.label}>
              <title>{`${d.label} (${d.sub}): ${fmt(d.value)}`}</title>
              {/* generous hit area */}
              <rect x={cx - slot / 2} y={padT} width={slot} height={h - padT - padB} fill="transparent" />
              {barH > 0 && <path d={`M${cx - bw / 2},${h - padB} V${top + 4} q0,-4 4,-4 H${cx + bw / 2 - 4} q4,0 4,4 V${h - padB} Z`} fill="currentColor" className="transition-opacity duration-300 hover:opacity-75" />}
              {(i === data.length - 1 || i === 0) && (
                <text x={cx} y={top - 5} textAnchor="middle" className="fill-gray-700 text-[10px]">{fmt(d.value)}</text>
              )}
              {i % showEvery === 0 && (
                <text x={cx} y={h - 7} textAnchor="middle" className="fill-gray-500 text-[10px]">{d.label}</text>
              )}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
