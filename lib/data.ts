// Reads engine output: local ./runs in dev, Vercel Blob (public) when BLOB_READ_WRITE_TOKEN is set.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { cache } from "react";

const token = process.env.BLOB_READ_WRITE_TOKEN;
export const BLOB_BASE = token ? `https://${token.split("_")[3]}.public.blob.vercel-storage.com` : null;

// cache(): one read per file per request, so pages that fan out over 30 runs never re-read a file.
export const readRun = cache(async function readRun<T>(rel: string): Promise<T | null> {
  if (BLOB_BASE) {
    const r = await fetch(`${BLOB_BASE}/runs/${rel}`, { next: { revalidate: 60 } });
    return r.ok ? ((await r.json()) as T) : null;
  }
  try {
    return JSON.parse(await readFile(path.join(process.cwd(), "runs", rel), "utf8")) as T;
  } catch {
    return null;
  }
}) as <T>(rel: string) => Promise<T | null>;

export type Track = { metric: string; ids: string[]; at_alert: number | null; target: number | null; better: string };
export type Issue = {
  key: string; kind: string; lever: string; store_id: string | null; city: string; am_id: string;
  title: string; cause: string; action: { who: string; what: string; when: string };
  rupees: number; rupees_formula: string; evidence: Record<string, unknown>; track: Track;
  text_en?: string; text_local?: string | null; sent_on?: string;
};
export type Followup = { key: string; title: string; am_id: string; alerted_on: string; metric: string;
  before: number | null; after: number | null; sample: number; status: string; summary: string };
export type RoleModel = { salesperson_id: string; name: string; store_id: string; repeat_rate: number;
  store_rate: number; customers: number };
export type Digest = {
  am_id: string; name: string; city: string; lang: string; as_of: string; max_per_week: number;
  new_today: Issue[]; earlier_this_week: Issue[]; held_back: number; followups: Followup[];
  role_models: RoleModel[]; notes: string[];
  briefing_en?: string; briefing_local?: string | null; briefing_audio?: string | null;
};
export type Card = {
  salesperson_id: string; name: string; store_id: string; city: string; behaviour: string;
  peer_name: string | null; source: string; rupees: number; text_en: string; lang: string;
  text_local: string | null; audio: string | null;
};
export type Meta = { as_of: string; today: string; issues_found: number; cards: number; sarvam: boolean };
export type DataIssue = { type: string; store_id?: string; note?: string; [k: string]: unknown };

export async function getIndex() {
  return (await readRun<{ dates: string[]; latest: string }>("index.json")) ?? { dates: [], latest: "" };
}

export type SP = { date?: string; from?: string; to?: string };

// Range from ?from=&to= (legacy ?date= means to). Default: the last 30 runs. `date` = `to` drives digests, cards and issues.
export async function resolveRange(sp: SP) {
  const idx = await getIndex();
  const ds = idx.dates;
  const ok = (d?: string) => (d && ds.includes(d) ? d : undefined);
  const to = ok(sp.to) ?? ok(sp.date) ?? idx.latest;
  const f = ok(sp.from);
  const from = f && f <= to ? f : ds[Math.max(0, ds.indexOf(to) - 29)] ?? to;
  return { idx, date: to, from, to, q: `from=${from}&to=${to}` };
}

export const audioUrl = (p: string | null | undefined) => (p ? `/runs/${p}` : null);

export const inr = (x: number) =>
  x >= 1e7 ? `₹${(x / 1e7).toFixed(2)} Cr` : x >= 1e5 ? `₹${(x / 1e5).toFixed(1)} lakh` : x >= 1e3 ? `₹${Math.round(x / 1e3)}k` : `₹${Math.round(x)}`;
export const pct = (x: number | null | undefined, dp = 1) => (x == null ? "—" : `${(x * 100).toFixed(dp)}%`);
export const day = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

export type StoreMetric = {
  store_id: string; bills: number; revenue: number; items_per_bill: number; abv: number; discount_pct: number;
  repeat_rate: number | null; conversion: number | null; conv_bills: number | null; footfall: number;
  valid_days: number; invalid_days: number; returning_share: number | null;
  attach_sherwani_safa: number | null; attach_sherwani_mojari: number | null; attach_sherwani_mala: number | null;
  attach_kurta_set_jacket: number | null;
};
export type SalesMetric = { salesperson_id: string; store_id: string; name: string; bills: number | null; revenue: number | null; abv: number | null };

// Store id prefix -> city. One AM per city (see digests.json for the AM).
export const CITY: Record<string, string> = {
  LKO: "Lucknow", KNP: "Kanpur", PAT: "Patna", MZF: "Muzaffarpur", BLR: "Bengaluru", MYS: "Mysuru",
};
export const cityOf = (store: string) => CITY[store.slice(0, 3)] ?? store.slice(0, 3);

// One file read per run date up to `date` (oldest first). Metrics are 28-day rolling, so this is a smoothed trend.
export async function series<T>(dates: string[], date: string, file: string, from = "") {
  return Promise.all(
    dates.filter((d) => d <= date && d >= from).map(async (d) => ({ date: d, data: await readRun<T>(`${d}/${file}`) })),
  );
}

// Network conversion = converting bills / footfall on valid days only (excludes broken-camera days).
export function conv(rows: StoreMetric[]) {
  let b = 0, f = 0;
  for (const r of rows) if (r.conversion && r.conv_bills != null) { b += r.conv_bills; f += r.conv_bills / r.conversion; }
  return f ? b / f : null;
}
export const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
export const short = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
export const num = (x: number) => (x >= 1e3 ? `${(x / 1e3).toFixed(x >= 1e4 ? 0 : 1)}k` : `${Math.round(x)}`);
