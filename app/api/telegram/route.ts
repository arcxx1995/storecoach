// Telegram webhook: a manager presses Start on their personal link and the bot saves their chat id.
// Link payload: AM-01_<code>, code = first 16 hex of HMAC-SHA256("link:" + TELEGRAM_SECRET, "AM-01"). Only whoever
// holds TELEGRAM_SECRET (scripts/telegram_setup.py --links) can make a valid link, so nobody can claim another manager.
import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { put } from "@vercel/blob";

const SECRET = process.env.TELEGRAM_SECRET;
const API = process.env.TELEGRAM_API_URL ?? "https://api.telegram.org";

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const codeFor = (am: string) => createHmac("sha256", `link:${SECRET}`).update(am).digest("hex").slice(0, 16);

async function reply(chat: number, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  await fetch(`${API}/bot${token}/sendMessage`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text }),
  }).catch(() => {});
}

// One small file per manager, so two managers registering at once never overwrite each other.
async function save(am: string, chat: number) {
  const body = JSON.stringify({ chat_id: chat, at: new Date().toISOString() });
  const rel = `subscribers/${am}.json`;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    await put(`runs/${rel}`, body, { access: "public", allowOverwrite: true, addRandomSuffix: false, contentType: "application/json", cacheControlMaxAge: 60 });
    return;
  }
  const p = path.join(process.cwd(), "runs", rel);
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, body);
}

export async function POST(req: Request) {
  if (!SECRET) return Response.json({ error: "TELEGRAM_SECRET is not set" }, { status: 503 });
  if (!same(req.headers.get("x-telegram-bot-api-secret-token") ?? "", SECRET)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const msg = (await req.json().catch(() => null))?.message;
  const chat = msg?.chat?.type === "private" ? Number(msg.chat.id) : null;
  const m = typeof msg?.text === "string" ? msg.text.match(/^\/start(?:@\w+)?(?:\s+(\S+))?/) : null;
  if (!chat || !m) return Response.json({ ok: true }); // not a /start in a private chat: ignore
  const [am, code] = (m[1] ?? "").split("_");
  if (!/^AM-\d{2}$/.test(am ?? "") || !code || !same(code, codeFor(am))) {
    await reply(chat, "Use the personal Store Coach link you were sent to connect.");
    return Response.json({ ok: true });
  }
  try {
    await save(am, chat);
    await reply(chat, `Connected as ${am}. Your morning briefing will arrive here.`);
  } catch (e) {
    console.error("telegram register failed", e);
    await reply(chat, "Could not connect right now. Press Start on your link again in a minute.");
    return Response.json({ error: "save failed" }, { status: 500 }); // Telegram retries non-2xx
  }
  return Response.json({ ok: true });
}
