"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

// Server pages pass plain data only: each cell carries its sort value and what to show.
export type Cell = { sort: string | number; text: string; sub?: string; href?: string; level?: number };
export type Col = { key: string; label: string; kind?: "text" | "num" | "meter" | "link" | "issue"; filter?: boolean };
export type Row = { id: string; cells: Record<string, Cell> };

const TONE = ["", "low", "med", "high", "crit"];

export function Meter({ level, label }: { level: number; label: string }) {
  return (
    <span className="meter" title={label}>
      <span className="bars" aria-hidden>
        {Array.from({ length: 4 }, (_, k) => <i key={k} className={k < level ? `on ${TONE[Math.min(4, Math.max(1, level))]}` : ""} />)}
      </span>
      <span className="meter-label">{label}</span>
    </span>
  );
}

// Sort + filter state lives in the URL (?sort=&dir=&q=&f_<col>=a|b) next to the date range, so views are shareable.
export function DataTable({ cols, rows, defaultSort }: { cols: Col[]; rows: Row[]; defaultSort: { key: string; dir: "asc" | "desc" } }) {
  const router = useRouter(), path = usePathname(), sp = useSearchParams();
  const sort = sp.get("sort") ?? defaultSort.key, dir = (sp.get("dir") ?? defaultSort.dir) as "asc" | "desc";
  const [q, setQ] = useState(sp.get("q") ?? "");
  const chosen = (k: string) => (sp.get(`f_${k}`) ?? "").split("|").filter(Boolean);

  const set = (patch: Record<string, string | null>) => {
    const n = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) v ? n.set(k, v) : n.delete(k);
    router.replace(`${path}?${n}`, { scroll: false });
  };
  const toggleSort = (key: string) =>
    set(sort === key ? { sort: key, dir: dir === "asc" ? "desc" : "asc" } : { sort: key, dir: cols.find((c) => c.key === key)?.kind === "text" || cols.find((c) => c.key === key)?.kind === "link" ? "asc" : "desc" });
  const toggleOpt = (k: string, v: string) => {
    const cur = chosen(k);
    set({ [`f_${k}`]: (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]).join("|") || null });
  };

  const options = useMemo(
    () => Object.fromEntries(cols.filter((c) => c.filter).map((c) => {
      const m = new Map<string, number>();
      for (const r of rows) m.set(r.cells[c.key].text, r.cells[c.key].sort as number);
      const text = c.kind === "meter";   // meters order by level, others A-Z
      return [c.key, [...m.entries()].sort((a, b) => (text ? Number(b[1]) - Number(a[1]) : a[0].localeCompare(b[0]))).map(([t]) => t)];
    })),
    [cols, rows],
  );

  const needle = (sp.get("q") ?? "").toLowerCase();
  const shown = useMemo(() => {
    const f = cols.filter((c) => c.filter).map((c) => [c.key, chosen(c.key)] as const).filter(([, v]) => v.length);
    const out = rows.filter((r) =>
      f.every(([k, v]) => v.includes(r.cells[k].text)) &&
      (!needle || Object.values(r.cells).some((c) => `${c.text} ${c.sub ?? ""}`.toLowerCase().includes(needle))));
    const s = dir === "asc" ? 1 : -1;
    return out.sort((a, b) => {
      const x = a.cells[sort]?.sort ?? 0, y = b.cells[sort]?.sort ?? 0;
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * s;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, cols, sp, sort, dir, needle]);

  const active = [...sp.keys()].some((k) => k.startsWith("f_") || k === "q");
  const clear = () => {
    const n = new URLSearchParams(sp.toString());
    [...n.keys()].filter((k) => k.startsWith("f_") || k === "q").forEach((k) => n.delete(k));
    setQ("");
    router.replace(`${path}?${n}`, { scroll: false });
  };

  return (
    <>
      <div className="filters">
        <input type="search" placeholder="Search…" value={q} aria-label="Search"
          onChange={(e) => { setQ(e.target.value); set({ q: e.target.value || null }); }} />
        {cols.filter((c) => c.filter).map((c) => (
          <div className="fgroup" key={c.key} role="group" aria-label={`Filter by ${c.label}`}>
            <span className="small">{c.label}</span>
            {options[c.key].map((o) => (
              <button key={o} type="button" className={`fchip${chosen(c.key).includes(o) ? " on" : ""}`} aria-pressed={chosen(c.key).includes(o)}
                onClick={() => toggleOpt(c.key, o)}>{o}</button>
            ))}
          </div>
        ))}
        {active && <button type="button" className="fclear" onClick={clear}>Clear filters</button>}
        <span className="small fcount">{shown.length} of {rows.length}</span>
      </div>
      <div className="panel tablewrap">
        <table className="stack sortable">
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c.key} className={c.kind === "num" ? "num" : undefined} aria-sort={sort === c.key ? (dir === "asc" ? "ascending" : "descending") : "none"}>
                  <button type="button" onClick={() => toggleSort(c.key)}>{c.label}<span aria-hidden>{sort === c.key ? (dir === "asc" ? " ▲" : " ▼") : " ↕"}</span></button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                {cols.map((c) => {
                  const v = r.cells[c.key];
                  if (c.kind === "meter") return <td key={c.key} data-label={c.label}><Meter level={v.level ?? 0} label={v.text} /></td>;
                  if (c.kind === "num") return <td key={c.key} className="num rupees" data-label={c.label}>{v.text}</td>;
                  if (c.kind === "issue") return <td key={c.key} className="issue-cell">{v.text}{v.sub && <div className="small">{v.sub}</div>}</td>;
                  if (c.kind === "link" && v.href) return <td key={c.key} data-label={c.label}><Link href={v.href}>{v.text}</Link></td>;
                  return <td key={c.key} data-label={c.label}>{v.text}</td>;
                })}
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={cols.length} className="empty">Nothing matches these filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
