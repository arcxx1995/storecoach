// Server-only Sarvam TTS: sentence-chunked, disk-cached, with a per-IP limit on cache misses.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const DIR = path.join(os.tmpdir(), "sarvam-tts");
const hits = new Map<string, number[]>();
// ponytail: per-instance in-memory limit; swap for Vercel Firewall / Upstash if abuse shows up.
export function limited(ip: string, max: number) {
  const now = Date.now(), recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > max;
}
export const ipOf = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";

export const langOf = (text: string) => (/[ऀ-ॿ]/.test(text) ? "hi-IN" : /[ಀ-೿]/.test(text) ? "kn-IN" : "en-IN");

function chunks(text: string, limit = 2500) {
  const out: string[] = [];
  let cur = "";
  for (const s of text.split(/(?<=[.!?।])\s+/)) {
    if (cur && cur.length + s.length + 1 > limit) { out.push(cur); cur = ""; }
    cur = `${cur} ${s}`.trim();
  }
  return cur ? [...out, cur] : out;
}

async function one(text: string, lang: string, ip: string): Promise<Buffer> {
  const model = process.env.SARVAM_TTS_MODEL ?? "bulbul:v3", speaker = process.env.SARVAM_SPEAKER ?? "shubh";
  const file = path.join(DIR, createHash("sha256").update(JSON.stringify([text, lang, model, speaker])).digest("hex").slice(0, 32) + ".mp3");
  try { return await readFile(file); } catch {}
  if (limited(ip, 20)) throw new Error("rate");
  const r = await fetch("https://api.sarvam.ai/text-to-speech", {
    method: "POST",
    headers: { "api-subscription-key": process.env.SARVAM_API_KEY!, "content-type": "application/json" },
    body: JSON.stringify({ text, language_code: lang, model, speaker, pace: 1.0, speech_sample_rate: 22050, output_audio_codec: "mp3" }),
  });
  if (!r.ok) throw new Error(`sarvam ${r.status}`);
  const b64 = (await r.json()).audios?.[0];
  if (!b64) throw new Error("no audio");
  const buf = Buffer.from(b64, "base64");
  await mkdir(DIR, { recursive: true }).then(() => writeFile(file, buf)).catch(() => {});
  return buf;
}

export async function speak(text: string, lang: string, ip: string) {
  return Buffer.concat(await Promise.all(chunks(text).map((c) => one(c, lang, ip)))); // mp3 frames concatenate
}

export function audioResponse(buf: Buffer, cache: boolean) {
  return new Response(new Uint8Array(buf), { headers: {
    "content-type": "audio/mpeg",
    "cache-control": cache ? "public, max-age=86400, s-maxage=31536000, immutable" : "no-store" } });
}

export function failure(e: unknown) {
  const m = e instanceof Error ? e.message : "";
  return Response.json({ error: m === "rate" ? "Too many requests. Wait a minute." : "Voice unavailable." }, { status: m === "rate" ? 429 : 502 });
}
