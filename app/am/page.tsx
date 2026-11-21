import Link from "next/link";
import { inr, perMonth, readRun, resolveRange, type SP, type Digest } from "@/lib/data";
import { Header } from "../ui";

export default async function Managers({ searchParams }: { searchParams: Promise<SP> }) {
  const { idx, date, from, to, q } = await resolveRange(await searchParams);
  const run = await readRun<{ digests: Record<string, Digest> }>(`${date}/digests.json`);
  const digests = Object.values(run?.digests ?? {});
  return (
    <>
      <Header from={from} to={to} dates={idx.dates} path="/am" />
      <section className="hero" data-hero>
        <h1>Area managers</h1>
        <p className="sub">Up to {digests[0]?.max_per_week ?? 5} issues a week per manager, ranked by ₹ at stake.</p>
      </section>
      <div className="grid">
        {digests.map((d) => {
          const week = [...d.new_today, ...d.earlier_this_week];
          return (
            <Link key={d.am_id} href={`/am/${d.am_id}?${q}`} className="panel lift" data-reveal>
              <div className="chips">
                <span className="chip">{d.city}</span>
                {d.new_today.length > 0 && <span className="chip lever">{d.new_today.length} new</span>}
                <span className="chip">{week.length}/{d.max_per_week} this week</span>
              </div>
              <h3>{d.name}</h3>
              {d.new_today[0] ? (
                <p className="small" style={{ margin: 0 }}>{d.new_today[0].title} · <span className="rupees">{inr(perMonth(d.new_today[0].rupees))}/month</span></p>
              ) : (
                <p className="small" style={{ margin: 0 }}>No new issues today{d.followups.length ? ` · ${d.followups.length} follow-up(s)` : ""}</p>
              )}
            </Link>
          );
        })}
      </div>
    </>
  );
}
