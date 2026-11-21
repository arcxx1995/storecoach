// Telegram webhook. A manager opens the shared bot link, presses Start, taps their name; the admin approves with a
// button; the chat id is saved as subscribers/<AM>.json, which the daily delivery reads.
//   /start                 -> name picker
//   pick:AM-01 (button)    -> asks the admin to approve or reject
//   ok:<chat>:AM-01 / no:<chat> (admin only) -> save or decline
//   /start admin_<code>    -> makes this chat the admin (code = HMAC, printed by scripts/telegram_setup.py --links)
//   /start AM-01_<code>    -> personal link: connects without approval
import { getIndex, readRun, type Digest } from "@/lib/data";
import { SECRET, codeFor, limited, readSub, same, saveSub, tg } from "@/lib/telegram";

const AM = /^AM-\d{2}$/;
const ok = () => Response.json({ ok: true });

async function managers() {
  const { latest } = await getIndex();
  const dg = latest ? await readRun<{ digests: Record<string, Digest> }>(`${latest}/digests.json`) : null;
  return Object.values(dg?.digests ?? {});
}

async function onStart(chat: number, payload: string) {
  const [id, code] = payload.split("_");
  if (id === "admin") {
    if (code && same(code, codeFor("ADMIN"))) {
      await saveSub("admin", chat);
      return tg("sendMessage", { chat_id: chat, text: "You are the Store Coach admin. Requests from area managers will arrive here for approval." });
    }
    return tg("sendMessage", { chat_id: chat, text: "That admin link is not valid." });
  }
  if (AM.test(id ?? "") && code && same(code, codeFor(id))) { // personal link: no approval needed
    await saveSub(id, chat);
    return tg("sendMessage", { chat_id: chat, text: `Connected as ${id}. Your morning briefing will arrive here.` });
  }
  const ams = await managers();
  if (!ams.length) return tg("sendMessage", { chat_id: chat, text: "Store Coach is not ready yet. Try again later." });
  return tg("sendMessage", {
    chat_id: chat, text: "Welcome to Store Coach. Which area manager are you?",
    reply_markup: { inline_keyboard: ams.map((a) => [{ text: `${a.name} · ${a.city}`, callback_data: `pick:${a.am_id}` }]) },
  });
}

async function onCallback(cq: { id: string; data?: string; from: { id: number; first_name?: string; username?: string }; message?: { chat: { id: number }; message_id: number } }) {
  const data = cq.data ?? "";
  const done = (text?: string) => tg("answerCallbackQuery", { callback_query_id: cq.id, text });
  const who = cq.from.id;

  if (data.startsWith("pick:")) {
    const am = data.slice(5);
    const target = (await managers()).find((a) => a.am_id === am);
    if (!AM.test(am) || !target) return done("Unknown manager.");
    if (limited(who)) return done("Too many requests. Try again later.");
    const admin = await readSub("admin");
    if (!admin) return done("Setup is not finished. Ask the Store Coach admin.");
    const existing = await readSub(am);
    const handle = cq.from.username ? ` (@${cq.from.username})` : "";
    await tg("sendMessage", {
      chat_id: admin.chat_id,
      text: `${cq.from.first_name ?? "Someone"}${handle} says they are ${am}, ${target.name}, ${target.city}.${existing ? " This replaces the current connection." : ""}`,
      reply_markup: { inline_keyboard: [[{ text: "Approve", callback_data: `ok:${who}:${am}` }, { text: "Reject", callback_data: `no:${who}` }]] },
    });
    await tg("sendMessage", { chat_id: who, text: `Thanks. Waiting for approval as ${target.name}.` });
    return done();
  }

  const m = data.match(/^(ok|no):(\d+)(?::(AM-\d{2}))?$/);
  if (!m) return done();
  const admin = await readSub("admin");
  if (!admin || admin.chat_id !== who) return done("Not allowed.");
  const [, verdict, chat, am] = m;
  if (verdict === "ok" && am) {
    await saveSub(am, Number(chat));
    await tg("sendMessage", { chat_id: Number(chat), text: `Connected as ${am}. Your morning briefing will arrive here.` });
  } else {
    await tg("sendMessage", { chat_id: Number(chat), text: "Your request was declined. Ask the Store Coach admin." });
  }
  if (cq.message) await tg("editMessageText", {
    chat_id: cq.message.chat.id, message_id: cq.message.message_id,
    text: verdict === "ok" ? `Approved ${am}.` : "Rejected.",
  });
  return done(verdict === "ok" ? "Approved" : "Rejected");
}

export async function POST(req: Request) {
  if (!SECRET) return Response.json({ error: "TELEGRAM_SECRET is not set" }, { status: 503 });
  if (!same(req.headers.get("x-telegram-bot-api-secret-token") ?? "", SECRET)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const u = await req.json().catch(() => null);
  try {
    if (u?.callback_query) await onCallback(u.callback_query);
    else {
      const msg = u?.message;
      const m = typeof msg?.text === "string" ? msg.text.match(/^\/start(?:@\w+)?(?:\s+(\S+))?/) : null;
      const chat = msg?.chat?.type === "private" ? Number(msg.chat.id) : null;
      if (chat && m) {
        if (limited(chat, 20)) return ok();
        await onStart(chat, m[1] ?? "");
      }
    }
  } catch (e) {
    console.error("telegram webhook failed", e);
    return Response.json({ error: "failed" }, { status: 500 }); // Telegram retries non-2xx
  }
  return ok();
}
