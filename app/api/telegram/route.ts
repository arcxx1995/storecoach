// Telegram webhook. A manager opens the shared bot link, presses Start, taps their name; the admin approves with a
// button; the chat id is saved as subscribers/<AM>.json, which the daily delivery reads.
//   /start                 -> name picker
//   pick:AM-01 (button)    -> asks the admin to approve or reject
//   ok:<chat>:AM-01 / no:<chat> (admin only) -> save or decline
//   /start admin_<code>    -> makes this chat the admin (code = HMAC, printed by scripts/telegram_setup.py --links)
//   /start AM-01_<code>    -> personal link: connects without approval; the first chat to use it keeps it
//   salespeople: /start -> "I'm a salesperson" -> st:<store> -> pk:<SP id> -> their area manager (else the admin) approves.
//   /start SP1002_<code>   -> personal link, same first-use-wins rule
import { getIndex, readRun, type Digest, type Roster } from "@/lib/data";
import { SECRET, claimSub, codeFor, limited, readSub, same, saveSub, tg } from "@/lib/telegram";

const AM = /^AM-\d{2}$/;
const SPID = /^SP\d{4}$/;
const roster = () => readRun<Roster>("roster.json");
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
  if ((AM.test(id ?? "") || SPID.test(id ?? "")) && code && same(code, codeFor(id))) { // personal link: no approval, first use wins
    if (await claimSub(id, chat)) return tg("sendMessage", { chat_id: chat, text: `Connected as ${id}. Your morning briefing will arrive here.` });
    const owner = await readSub(id);
    return tg("sendMessage", { chat_id: chat, text: owner?.chat_id === chat
      ? `Already connected as ${id}. Your morning briefing will arrive here.`
      : "This link has already been used. Ask the Store Coach admin to reset it." });
  }
  const ams = await managers();
  if (!ams.length) return tg("sendMessage", { chat_id: chat, text: "Store Coach is not ready yet. Try again later." });
  return tg("sendMessage", {
    chat_id: chat, text: "Welcome to Store Coach. Who are you?",
    reply_markup: { inline_keyboard: [
      ...ams.map((a) => [{ text: `${a.name} · ${a.city}`, callback_data: `pick:${a.am_id}` }]),
      [{ text: "I'm a salesperson", callback_data: "sp" }],
    ] },
  });
}

async function onCallback(cq: { id: string; data?: string; from: { id: number; first_name?: string; username?: string }; message?: { chat: { id: number }; message_id: number } }) {
  const data = cq.data ?? "";
  const done = (text?: string) => tg("answerCallbackQuery", { callback_query_id: cq.id, text });
  const who = cq.from.id;

  if (data === "sp" || data.startsWith("st:")) { // salesperson: store, then name
    const r = await roster();
    if (!r) return done("Store Coach is not ready yet.");
    const st = data.slice(3);
    if (data === "sp") return tg("sendMessage", { chat_id: who, text: "Which store do you work in?", reply_markup: { inline_keyboard:
      Object.entries(r.stores).map(([id, s]) => [{ text: `${id} · ${s.city}`, callback_data: `st:${id}` }]) } }).then(() => done());
    const names = r.salespeople.filter((p) => p.store_id === st);
    if (!names.length) return done("Unknown store.");
    await tg("sendMessage", { chat_id: who, text: `Which one are you at ${st}?`, reply_markup: { inline_keyboard:
      names.map((p) => [{ text: p.name, callback_data: `pk:${p.id}` }]) } });
    return done();
  }

  if (data.startsWith("pk:")) {
    const id = data.slice(3);
    const r = await roster();
    const me = SPID.test(id) ? r?.salespeople.find((p) => p.id === id) : undefined;
    if (!me || !r) return done("Unknown salesperson.");
    const am = r.stores[me.store_id]?.am_id;
    const boss = (am && (await readSub(am))) || (await readSub("admin")); // their area manager if connected, else the admin
    if (!boss) return done("Setup is not finished. Ask the Store Coach admin.");
    if (limited(who, 10)) return done("Too many requests. Try again later.");
    const existing = await readSub(id);
    const handle = cq.from.username ? ` (@${cq.from.username})` : "";
    await tg("sendMessage", {
      chat_id: boss.chat_id,
      text: `${cq.from.first_name ?? "Someone"}${handle} says they are ${id}, ${me.name}, ${me.store_id}.${existing ? " This replaces the current connection." : ""}`,
      reply_markup: { inline_keyboard: [[{ text: "Approve", callback_data: `ok:${who}:${id}` }, { text: "Reject", callback_data: `no:${who}:${id}` }]] },
    });
    await tg("sendMessage", { chat_id: who, text: `Thanks. Waiting for approval as ${me.name}.` });
    return done();
  }

  if (data.startsWith("pick:")) {
    const am = data.slice(5);
    const target = (await managers()).find((a) => a.am_id === am);
    if (!AM.test(am) || !target) return done("Unknown manager.");
    const admin = await readSub("admin");
    if (!admin) return done("Setup is not finished. Ask the Store Coach admin.");
    if (limited(who, 10)) return done("Too many requests. Try again later."); // counts only requests that reach the admin
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

  const m = data.match(/^(ok|no):(\d+)(?::(AM-\d{2}|SP\d{4}))?$/);
  if (!m) return done();
  const admin = await readSub("admin");
  const [, verdict, chat, am] = m;
  let allowed = !!admin && admin.chat_id === who;
  if (!allowed && am && SPID.test(am)) { // a salesperson can also be approved by their own area manager
    const r = await roster();
    const boss = await readSub(r?.stores[r.salespeople.find((p) => p.id === am)?.store_id ?? ""]?.am_id ?? "");
    allowed = !!boss && boss.chat_id === who;
  }
  if (!allowed) return done("Not allowed.");
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
