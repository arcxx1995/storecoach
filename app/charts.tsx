import Link from "next/link";
// Hand-rolled SVG charts. Server-safe, no deps. Colours come from --c1..--c6 in globals.css.
export const C = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)", "var(--c5)", "var(--c6)"];

type Pt = number | null;
const W = 640;

function scale(vals: number[], pad = 0.08) {
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const p = (hi - lo || Math.abs(hi) || 1) * pad;
  return [lo - p, hi + p] as const;
}

export function Line({ series, labels, fmt, h = 220, zero = false }: {
  series: { name: string; pts: Pt[]; color?: string }[]; labels: string[]; fmt: (n: number) => string; h?: number; zero?: boolean;
}) {
  const all = series.flatMap((s) => s.pts.filter((p): p is number => p != null));
  if (!all.length) return <p className="empty small">No data yet.</p>;
  const [a0, b] = scale(zero ? [0, ...all] : all);
  const a = Math.min(...all) >= 0 ? Math.max(a0, 0) : a0; // no negative axis for counts and ₹
  const L = 46, R = 10, T = 10, B = 24, n = labels.length;
  const x = (i: number) => L + (n <= 1 ? 0 : (i / (n - 1)) * (W - L - R));
  const y = (v: number) => T + (1 - (v - a) / (b - a)) * (h - T - B);
  const ticks = [0, 1, 2, 3].map((k) => a + ((b - a) * k) / 3);
  const xl = [0, Math.floor((n - 1) / 2), n - 1].filter((v, i, r) => r.indexOf(v) === i);
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${h}`} role="img" aria-label={series.map((s) => s.name).join(", ")}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="grid-l" />
            <text x={L - 6} y={y(t) + 4} textAnchor="end" className="ax">{fmt(t)}</text>
          </g>
        ))}
        {xl.map((i) => <text key={i} x={x(i)} y={h - 6} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} className="ax">{labels[i]}</text>)}
        {series.map((s, k) => {
          const col = s.color ?? C[k % C.length];
          // break the line at nulls instead of bridging gaps
          const segs: string[] = []; let cur = "";
          s.pts.forEach((p, i) => { if (p == null) { if (cur) segs.push(cur); cur = ""; } else cur += `${cur ? "L" : "M"}${x(i).toFixed(1)},${y(p).toFixed(1)}`; });
          if (cur) segs.push(cur);
          return (
            <g key={s.name} style={{ color: col }}>
              {segs.map((d, i) => <path key={i} d={d} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />)}
              {s.pts.map((p, i) => p != null && (
                <circle key={i} cx={x(i)} cy={y(p)} r={i === n - 1 ? 3.5 : 6} fill="currentColor" fillOpacity={i === n - 1 ? 1 : 0} className="dot">
                  <title>{`${s.name} · ${labels[i]}: ${fmt(p)}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
      {series.length > 1 && (
        <figcaption className="legend">
          {series.map((s, k) => <span key={s.name}><i style={{ background: s.color ?? C[k % C.length] }} />{s.name}</span>)}
        </figcaption>
      )}
    </figure>
  );
}

export function Bars({ items, fmt, h = 180, color = C[0] }: {
  items: { label: string; value: number }[]; fmt: (n: number) => string; h?: number; color?: string;
}) {
  if (!items.length) return <p className="empty small">No data yet.</p>;
  const max = Math.max(...items.map((i) => i.value), 1);
  const L = 46, T = 10, B = 24, n = items.length, slot = (W - L - 10) / n, bw = Math.min(slot * 0.7, 28);
  const ticks = [0, 0.5, 1].map((k) => max * k);
  const y = (v: number) => T + (1 - v / max) * (h - T - B);
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${h}`} role="img" aria-label="Bar chart">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - 10} y1={y(t)} y2={y(t)} className="grid-l" />
            <text x={L - 6} y={y(t) + 4} textAnchor="end" className="ax">{fmt(t)}</text>
          </g>
        ))}
        {items.map((it, i) => (
          <g key={i}>
            <rect x={L + slot * i + (slot - bw) / 2} y={y(it.value)} width={bw} height={h - B - y(it.value)} rx={3} fill={color}>
              <title>{`${it.label}: ${fmt(it.value)}`}</title>
            </rect>
            {(i === 0 || i === n - 1 || i === Math.floor(n / 2)) && (
              <text x={L + slot * i + slot / 2} y={h - 6} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} className="ax">{it.label}</text>
            )}
          </g>
        ))}
      </svg>
    </figure>
  );
}

// Horizontal ranked bars in plain HTML: wraps and scales on phones.
export function HBars({ items, fmt }: {
  items: { label: string; value: number; sub?: string; color?: string; href?: string }[]; fmt: (n: number) => string;
}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="hbars">
      {items.map((it) => {
        const lab = it.href ? <Link href={it.href}>{it.label}</Link> : it.label;
        return (
          <li key={it.label}>
            <span className="hl">{lab}{it.sub && <small>{it.sub}</small>}</span>
            <span className="track"><b style={{ width: `${(it.value / max) * 100}%`, background: it.color ?? C[0] }} /></span>
            <span className="hv">{fmt(it.value)}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function Spark({ pts, good = true }: { pts: Pt[]; good?: boolean }) {
  const v = pts.filter((p): p is number => p != null);
  if (v.length < 2) return null;
  const [a, b] = scale(v, 0.15), w = 120, h = 36;
  const x = (i: number) => (i / (pts.length - 1)) * w;
  const y = (p: number) => h - ((p - a) / (b - a)) * h;
  const d = pts.map((p, i) => (p == null ? "" : `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p).toFixed(1)}`)).join("");
  return (
    <svg className={`spark ${good ? "up" : "down"}`} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      <path d={`${d}L${w},${h}L0,${h}Z`} fill="currentColor" fillOpacity={0.12} />
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.75} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function Donut({ parts, total }: { parts: { label: string; value: number; color: string }[]; total?: string }) {
  const sum = parts.reduce((s, p) => s + p.value, 0);
  if (!sum) return <p className="empty small">No follow-ups yet.</p>;
  const r = 40, c = 2 * Math.PI * r;
  let off = 0;
  return (
    <div className="donut">
      <svg viewBox="0 0 100 100" role="img" aria-label="Share by outcome">
        <g transform="rotate(-90 50 50)">
          {parts.filter((p) => p.value).map((p) => {
            const len = (p.value / sum) * c;
            const el = <circle key={p.label} cx={50} cy={50} r={r} fill="none" stroke={p.color} strokeWidth={14} strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-off}><title>{`${p.label}: ${p.value}`}</title></circle>;
            off += len; return el;
          })}
        </g>
        <text x={50} y={55} textAnchor="middle" className="dn">{total ?? sum}</text>
      </svg>
      <ul className="legend v">{parts.map((p) => <li key={p.label}><i style={{ background: p.color }} />{p.label} <b>{p.value}</b></li>)}</ul>
    </div>
  );
}

// KPI tile: label, big value, delta vs a week ago, sparkline.
export function Kpi({ label, value, delta, pts, vs, goodUp = true }: {
  label: string; value: string; delta?: number | null; pts: Pt[]; vs: string; goodUp?: boolean;
}) {
  const good = delta == null ? true : goodUp ? delta >= 0 : delta <= 0;
  return (
    <div className="panel kpi" data-reveal>
      <div className="small">{label}</div>
      <div className="stat">{value}</div>
      <div className="kpi-foot">
        {delta != null && pts.length > 1 && <span className={`delta ${good ? "ok" : "bad"}`}>{delta >= 0 ? "▲" : "▼"} {Math.abs(delta * 100).toFixed(1)}% <small>vs {vs}</small></span>}
        <Spark pts={pts} good={good} />
      </div>
    </div>
  );
}

export const change = (now: number | null | undefined, then: number | null | undefined) =>
  now != null && then ? (now - then) / Math.abs(then) : null;
