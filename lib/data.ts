// Reads engine output: local ./runs in dev, Vercel Blob (public) when BLOB_READ_WRITE_TOKEN is set.
import { readFile } from "node:fs/promises";
import path from "node:path";

const token = process.env.BLOB_READ_WRITE_TOKEN;
export const BLOB_BASE = token ? `https://${token.split("_")[3]}.public.blob.vercel-storage.com` : null;

export async function readRun<T>(rel: string): Promise<T | null> {
  if (BLOB_BASE) {
    const r = await fetch(`${BLOB_BASE}/runs/${rel}`, { next: { revalidate: 60 } });
    return r.ok ? ((await r.json()) as T) : null;
  }
  try {
    return JSON.parse(await readFile(path.join(process.cwd(), "runs", rel), "utf8")) as T;
  } catch {
    return null;
  }
}

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

export async function resolveDate(date?: string) {
  const idx = await getIndex();
  return { idx, date: date && idx.dates.includes(date) ? date : idx.latest };
}

export const audioUrl = (p: string | null | undefined) => (p ? `/runs/${p}` : null);

export const inr = (x: number) =>
  x >= 1e7 ? `₹${(x / 1e7).toFixed(2)} Cr` : x >= 1e5 ? `₹${(x / 1e5).toFixed(1)} lakh` : x >= 1e3 ? `₹${Math.round(x / 1e3)}k` : `₹${Math.round(x)}`;
export const pct = (x: number | null | undefined, dp = 1) => (x == null ? "—" : `${(x * 100).toFixed(dp)}%`);
export const day = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
