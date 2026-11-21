"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const fmt = (s: string, withYear = false) =>
  new Date(s + "T00:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" });
const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Range picker limited to dates that have a run. Pushes ?from=&to= so every page reads the same range.
export function DatePicker({ dates, from, to, path }: { dates: string[]; from: string; to: string; path: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [a, setA] = useState<string | null>(from);
  const [b, setB] = useState<string | null>(to);
  const [view, setView] = useState(() => ({ y: +to.slice(0, 4), m: +to.slice(5, 7) - 1 }));
  const box = useRef<HTMLDivElement>(null);
  const have = useMemo(() => new Set(dates), [dates]);
  const i0 = dates.indexOf(from), i1 = dates.indexOf(to), len = i1 - i0 + 1;

  const go = (f: string, t: string) => { setOpen(false); router.push(`${path}?from=${f}&to=${t}`); };
  const toggle = () => {
    if (!open) { setA(from); setB(to); setView({ y: +to.slice(0, 4), m: +to.slice(5, 7) - 1 }); }
    setOpen(!open);
  };
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", down); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [open]);

  const pick = (d: string) => {
    if (!a || b) { setA(d); setB(null); }       // start a new range
    else if (d < a) setA(d);
    else setB(d);
  };
  const last = (n: number) => go(dates[Math.max(0, dates.length - n)], dates[dates.length - 1]);
  const shift = (dir: -1 | 1) => {
    const s = dir < 0 ? i0 - len : i1 + 1;
    const e = Math.min(dates.length - 1, s + len - 1), st = Math.max(0, s);
    if (dir < 0 ? i0 > 0 : i1 < dates.length - 1) go(dates[st], dates[e]);
  };

  const { y, m } = view;
  const lead = (new Date(Date.UTC(y, m, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, k) => iso(y, m, k + 1))];
  const lo = a && b ? a : a, hi = b ?? a;
  const first = dates[0], lastD = dates[dates.length - 1];
  const monthLabel = new Date(Date.UTC(y, m, 1)).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
  const canPrev = iso(y, m, 1) > first.slice(0, 8) + "01", canNext = iso(y, m, days) < lastD;
  const nav = (d: number) => setView(({ y, m }) => { const t = m + d; return { y: y + Math.floor(t / 12), m: ((t % 12) + 12) % 12 }; });

  return (
    <div className="dp" ref={box}>
      <button className="dp-step" onClick={() => shift(-1)} disabled={i0 <= 0} aria-label="Previous period">‹</button>
      <button className="dp-trigger" onClick={toggle} aria-expanded={open} aria-haspopup="dialog">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></svg>
        <span>{from === to ? fmt(to, true) : `${fmt(from)} – ${fmt(to, true)}`}</span>
      </button>
      <button className="dp-step" onClick={() => shift(1)} disabled={i1 >= dates.length - 1} aria-label="Next period">›</button>
      {open && (
        <div className="dp-pop" role="dialog" aria-label="Choose date range">
          <div className="dp-presets">
            <button onClick={() => last(1)}>Latest day</button>
            <button onClick={() => last(7)}>Last 7 days</button>
            <button onClick={() => last(14)}>Last 14 days</button>
            <button onClick={() => last(30)}>Last 30 days</button>
            <button onClick={() => go(first, lastD)}>All runs</button>
          </div>
          <div className="dp-cal">
            <div className="dp-head">
              <button onClick={() => nav(-1)} disabled={!canPrev} aria-label="Previous month">‹</button>
              <b>{monthLabel}</b>
              <button onClick={() => nav(1)} disabled={!canNext} aria-label="Next month">›</button>
            </div>
            <div className="dp-grid">
              {WEEK.map((w) => <span key={w} className="dp-w">{w}</span>)}
              {cells.map((d, k) => d == null ? <span key={k} /> : (
                <button key={d} disabled={!have.has(d)} onClick={() => pick(d)} aria-label={fmt(d, true)} aria-pressed={d === a || d === b}
                  className={`dp-d${lo && hi && d >= lo && d <= hi ? " in" : ""}${d === a ? " edge" : ""}${d === (b ?? a) ? " edge" : ""}`}>
                  {+d.slice(8)}
                </button>
              ))}
            </div>
            <div className="dp-foot">
              <span className="small">{a ? `${fmt(a)} – ${fmt(b ?? a, true)}` : "Pick a start date"}</span>
              <button className="dp-apply" disabled={!a} onClick={() => go(a!, b ?? a!)}>Apply</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
