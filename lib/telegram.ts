// Telegram helpers shared by the webhook route and instrumentation.
import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { put } from "@vercel/blob";
import { BLOB_BASE } from "./data";

export const SECRET = process.env.TELEGRAM_SECRET;
const API = () => process.env.TELEGRAM_API_URL ?? "https://api.telegram.org";

export const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
// Personal-link code. Must match link_code() in engine/deliver.py.
export const codeFor = (id: string) => createHmac("sha256", `link:${SECRET}`).update(id).digest("hex").slice(0, 16);

export async function tg(method: string, body: object): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  await fetch(`${API()}/bot${token}/${method}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }).catch(() => {});
}

// Small files in the run store: subscribers/AM-01.json, subscribers/admin.json. One file each, so writes never collide.
export async function saveSub(name: string, chat: number) {
  const body = JSON.stringify({ chat_id: chat, at: new Date().toISOString() });
  const rel = `subscribers/${name}.json`;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    await put(`runs/${rel}`, body, { access: "public", allowOverwrite: true, addRandomSuffix: false, contentType: "application/json", cacheControlMaxAge: 60 });
    return;
  }
  const p = path.join(process.cwd(), "runs", rel);
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, body);
}

// Fresh read (the page cache in lib/data.ts keeps 404s and old values for a minute).
export async function readSub(name: string): Promise<{ chat_id: number } | null> {
  const rel = `subscribers/${name}.json`;
  try {
    if (BLOB_BASE) {
      const r = await fetch(`${BLOB_BASE}/runs/${rel}?t=${Date.now()}`, { cache: "no-store" });
      return r.ok ? await r.json() : null;
    }
    return JSON.parse(await readFile(path.join(process.cwd(), "runs", rel), "utf8"));
  } catch {
    return null;
  }
}

// ponytail: in-memory per instance, so serverless resets it; enough to stop a stranger spamming the admin.
const seen = new Map<number, number[]>();
export function limited(chat: number, max = 5, windowMs = 3600_000) {
  const now = Date.now();
  const hits = (seen.get(chat) ?? []).filter((t) => now - t < windowMs);
  hits.push(now);
  seen.set(chat, hits);
  return hits.length > max;
}
