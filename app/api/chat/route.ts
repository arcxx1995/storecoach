// Ask-the-coach: answers an area manager's question using ONLY that day's computed JSON (sarvam-105b).
import { readRun, type Card, type Digest, type Issue } from "@/lib/data";
import { ipOf, limited } from "@/lib/sarvam";

// Drop bulky fields the answer never needs (evidence blobs, formulas, tracking config, translations).
const slim = ({ evidence: _e, rupees_formula: _f, track: _t, text_local: _l, cards: _c, ...i }: Issue & { cards?: unknown }) => i;

const SYSTEM = `You are Store Coach, an assistant for a Manyavar area manager. Answer ONLY from the DATA JSON.
Never invent or recompute numbers; quote them as they appear. If the answer is not in DATA, say you don't have
that data. Keep answers under 80 words, practical, and name who/what/when when suggesting an action.
Reply in the same language and script as the QUESTION (an English question gets an English answer), whatever
language the DATA is in. Refer to people with respectful, gender-neutral forms.`;

export async function POST(req: Request) {
  if (limited(ipOf(req), 10)) return Response.json({ error: "Too many questions. Wait a minute." }, { status: 429 });
  const { date, amId, question } = (await req.json()) as { date: string; amId: string; question: string };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^AM-\d{2}$/.test(amId)) return Response.json({ error: "Bad date or area manager." }, { status: 400 });
  if (!question?.trim() || question.length > 500) return Response.json({ error: "Ask a short question." }, { status: 400 });
  const key = process.env.SARVAM_API_KEY;
  if (!key) return Response.json({ error: "SARVAM_API_KEY is not set." }, { status: 500 });

  const [dg, iss, cards] = await Promise.all([
    readRun<{ digests: Record<string, Digest> }>(`${date}/digests.json`),
    readRun<{ issues: (Issue & { cards?: unknown })[] }>(`${date}/issues.json`),
    readRun<{ cards: Card[] }>(`${date}/cards.json`),
  ]);
  const digest = dg?.digests[amId];
  if (!digest) return Response.json({ error: "No run for that date or area manager." }, { status: 404 });
  const data = {
    digest: { ...digest, briefing_local: undefined, briefing_audio: undefined, new_today: digest.new_today.map(slim), earlier_this_week: digest.earlier_this_week.map(slim) },
    all_issues_found: (iss?.issues ?? []).filter((i) => i.am_id === amId).map(slim),
    salesperson_cards: (cards?.cards ?? []).filter((c) => c.city === digest.city).map(({ text_local: _t, audio: _a, lang: _g, ...c }) => c),
  };

  const r = await fetch("https://api.sarvam.ai/v1/chat/completions", {
    method: "POST",
    headers: { "api-subscription-key": key, "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.SARVAM_CHAT_MODEL ?? "sarvam-105b", temperature: 0.2, max_tokens: 900, reasoning_effort: null,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `DATA:\n${JSON.stringify(data)}\n\nQUESTION: ${question}` },
      ],
    }),
  });
  if (!r.ok) return Response.json({ error: `Sarvam error ${r.status}` }, { status: 502 });
  const j = await r.json();
  const answer = String(j.choices?.[0]?.message?.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  return Response.json({ answer: answer || "No answer came back. Try rephrasing." });
}
