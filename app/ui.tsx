import Link from "next/link";
import { audioUrl, day, inr, type Followup, type Issue } from "@/lib/data";

export function Header({ date, dates, path = "/" }: { date: string; dates: string[]; path?: string }) {
  const i = dates.indexOf(date);
  const prev = i > 0 ? dates[i - 1] : null;
  const next = i >= 0 && i < dates.length - 1 ? dates[i + 1] : null;
  const q = (d: string) => `${path}?date=${d}`;
  return (
    <header className="top">
      <Link href={`/?date=${date}`} className="brand">Store <span>Coach</span></Link>
      <nav className="links">
        <Link href={`/?date=${date}`}>Area managers</Link>
        <Link href={`/stores?date=${date}`}>Salesperson cards</Link>
        <Link href={`/issues?date=${date}`}>All issues</Link>
        <Link href={`/followups?date=${date}`}>Follow-ups</Link>
        <Link href={`/data?date=${date}`}>Data issues</Link>
      </nav>
      <div className="datenav" aria-label="Run date">
        {prev ? <Link href={q(prev)}>←</Link> : <span className="btn">←</span>}
        <span>Morning of <b>{day(nextDay(date))}</b></span>
        {next ? <Link href={q(next)}>→</Link> : <span className="btn">→</span>}
      </div>
    </header>
  );
}

export const nextDay = (iso: string) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

export function IssueCard({ i }: { i: Issue }) {
  return (
    <article className="panel issue">
      <div className="chips">
        <span className="chip lever">{i.lever}</span>
        {i.sent_on && <span className="chip">sent {day(i.sent_on)}</span>}
      </div>
      <h3>{i.title}</h3>
      <div><span className="rupees">{inr(i.rupees)}</span> <span className="small">at stake per 4 weeks</span></div>
      <p className="small" style={{ margin: "8px 0 0" }}><b>Cause.</b> {i.cause}</p>
      <div className="action">
        <div><b>Who</b> {i.action.who}</div>
        <div><b>What</b> {i.action.what}</div>
        <div><b>When</b> {i.action.when}</div>
      </div>
      {i.text_local && <p className="local">{i.text_local}</p>}
      <details><summary>How the ₹ is worked out</summary><p className="small">{i.rupees_formula}</p></details>
    </article>
  );
}

export function FollowupRow({ f }: { f: Followup }) {
  const cls = f.status === "improved" ? "ok" : f.status === "worse" ? "bad" : "";
  const label = { improved: "Improved", worse: "Got worse", flat: "Not moved", too_early: "Too early to tell" }[f.status] ?? f.status;
  return (
    <div className="panel">
      <div className="chips"><span className={`chip ${cls}`}>{label}</span><span className="chip">alerted {day(f.alerted_on)}</span></div>
      <div>{f.summary}</div>
    </div>
  );
}

export function Audio({ src }: { src: string | null | undefined }) {
  const u = audioUrl(src);
  return u ? <audio controls preload="none" src={u} /> : null;
}
