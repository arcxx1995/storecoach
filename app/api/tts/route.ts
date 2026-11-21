// Voice on demand, nothing pre-generated.
// GET  ?date=&am=AM-01 | ?date=&sp=SP1018  -> voices the stored briefing/card text (CDN-cacheable, no arbitrary text).
// POST {text}                              -> voices a chat answer.
import { readRun, type Card, type Digest } from "@/lib/data";
import { audioResponse, failure, ipOf, langOf, speak } from "@/lib/sarvam";

const noKey = () => (process.env.SARVAM_API_KEY ? null : Response.json({ error: "SARVAM_API_KEY is not set." }, { status: 500 }));

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const date = q.get("date") ?? "", am = q.get("am"), sp = q.get("sp");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !(am ? /^AM-\d{2}$/.test(am) : sp && /^[A-Z0-9-]{3,12}$/.test(sp))) return Response.json({ error: "Bad request." }, { status: 400 });
  if (noKey()) return noKey()!;
  let text: string | null | undefined, lang = "en-IN";
  if (am) {
    const d = (await readRun<{ digests: Record<string, Digest> }>(`${date}/digests.json`))?.digests[am];
    text = d?.briefing_local ?? d?.briefing_en;
    if (d?.briefing_local) lang = d.lang;
  } else {
    const c = (await readRun<{ cards: Card[] }>(`${date}/cards.json`))?.cards.find((x) => x.salesperson_id === sp);
    text = c?.text_local ?? c?.text_en;
    if (c?.text_local) lang = c.lang;
  }
  if (!text) return Response.json({ error: "Not found." }, { status: 404 });
  try { return audioResponse(await speak(text, lang, ipOf(req)), true); } catch (e) { return failure(e); }
}

export async function POST(req: Request) {
  const { text } = (await req.json()) as { text: string };
  if (noKey()) return noKey()!;
  if (!text?.trim() || text.length > 1500) return Response.json({ error: "Bad text." }, { status: 400 });
  try { return audioResponse(await speak(text, langOf(text), ipOf(req)), false); } catch (e) { return failure(e); }
}
