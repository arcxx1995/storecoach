import Link from "next/link";
import { DatePicker } from "./datepicker";
import { LangSwitch } from "./langswitch";
import Listen from "./listen";
import { audioUrl, day, inr, perMonth, type Followup, type Issue } from "@/lib/data";

// Empty bar (its bottom border is the line); the date picker sits just below it.
export function Header({ from, to, dates, path = "/" }: { from: string; to: string; dates: string[]; path?: string }) {
  return (
    <>
      <header className="top" />
      <div className="toolbar"><LangSwitch /><DatePicker dates={dates} from={from} to={to} path={path} /></div>
    </>
  );
}

export const nextDay = (iso: string) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

export function IssueCard({ i, fb = false }: { i: Issue; fb?: boolean }) {
  return (
    <article className="panel issue" data-reveal>
      <div className="chips">
        <span className="chip lever">{i.lever}</span>
        {i.sent_on && <span className="chip">sent {day(i.sent_on)}</span>}
        <Fallback on={fb && !i.text_local} />
      </div>
      <h3>{i.title}</h3>
      <div><span className="rupees">{inr(perMonth(i.rupees))}</span> <span className="small">at stake per month</span></div>
      <p className="small" style={{ margin: "8px 0 0" }}><b>Cause.</b> {i.cause}</p>
      <div className="action">
        <div><b>Who</b> {i.action.who}</div>
        <div><b>What</b> {i.action.what}</div>
        <div><b>When</b> {i.action.when}</div>
      </div>
      {i.text_local && <p className="local t-local">{i.text_local}</p>}
      <details><summary>How the ₹ is worked out</summary><p className="small">{i.rupees_formula}</p></details>
    </article>
  );
}

export function FollowupRow({ f }: { f: Followup }) {
  const cls = f.status === "improved" ? "ok" : f.status === "worse" ? "bad" : "";
  const label = { improved: "Improved", worse: "Got worse", flat: "Not moved", too_early: "Too early to tell" }[f.status] ?? f.status;
  return (
    <div className="panel" data-reveal>
      <div className="chips"><span className={`chip ${cls}`}>{label}</span><span className="chip">alerted {day(f.alerted_on)}</span></div>
      <div>{f.summary}</div>
    </div>
  );
}

// Old runs have a pre-made mp3 (src, local language); otherwise voice on first click via /api/tts (CDN-cached after that).
export function Audio({ src, date, am, sp, en }: { src?: string | null; date?: string; am?: string; sp?: string; en?: boolean }) {
  const u = en ? null : audioUrl(src);
  if (u) return <audio controls preload="none" src={u} />;
  return date && (am || sp) ? <Listen date={date} am={am} sp={sp} en={en} /> : null;
}

// Local text + voice and English text + voice; the global switch (html[data-lang]) shows one. English only when no translation.
export function Bilingual({ local, en, className, audio }: { local?: string | null; en?: string; className: string; audio: Parameters<typeof Audio>[0] }) {
  if (!local) return <><p className={className}>{en}</p><Audio {...audio} en /></>;
  return (
    <>
      <div className="t-local"><p className={`${className} local`}>{local}</p><Audio {...audio} /></div>
      <div className="t-en"><p className={className}>{en}</p><Audio {...audio} en /></div>
    </>
  );
}

export const Fallback = ({ on }: { on: boolean }) =>
  on ? <span className="chip bad" title="Translation was unavailable or failed number checks">English only</span> : null;
