import Link from "next/link";
import { inr, readRun, resolveDate, type Digest, type Meta } from "@/lib/data";
import { Header } from "./ui";

export default async function Home({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { idx, date } = await resolveDate((await searchParams).date);
  if (!date) return <p className="empty">No runs yet. Run <code>python -m engine.backfill</code>.</p>;
  const run = await readRun<{ meta: Meta; digests: Record<string, Digest> }>(`${date}/digests.json`);
  const dq = await readRun<{ rows: unknown[] }>(`${date}/data_issues.json`);
  const digests = Object.values(run?.digests ?? {});
  const newToday = digests.reduce((n, d) => n + d.new_today.length, 0);
  const atStake = digests.reduce((n, d) => n + [...d.new_today, ...d.earlier_this_week].reduce((s, i) => s + i.rupees, 0), 0);

  return (
    <>
      <Header date={date} dates={idx.dates} />
      <h1>Area managers</h1>
      <p className="sub">
        Ran on its own at close of {date}. At most {digests[0]?.max_per_week ?? 5} issues per manager per week, ranked by ₹ at stake.
      </p>
      <div className="grid" style={{ marginBottom: 8 }}>
        <div className="panel"><div className="small">New issues sent today</div><div className="stat">{newToday}</div></div>
        <div className="panel"><div className="small">₹ at stake this week (per 4 weeks)</div><div className="stat">{inr(atStake)}</div></div>
        <div className="panel"><div className="small">Problems found</div><div className="stat">{run?.meta.issues_found ?? 0}</div></div>
        <div className="panel"><div className="small">Data issues held back</div><div className="stat">{dq?.rows.length ?? 0}</div></div>
      </div>
      <h2>Today&apos;s digests</h2>
      <div className="grid">
        {digests.map((d) => {
          const week = [...d.new_today, ...d.earlier_this_week];
          return (
            <Link key={d.am_id} href={`/am/${d.am_id}?date=${date}`} className="panel" style={{ textDecoration: "none" }}>
              <div className="chips">
                <span className="chip">{d.city}</span>
                {d.new_today.length > 0 && <span className="chip lever">{d.new_today.length} new</span>}
                <span className="chip">{week.length}/{d.max_per_week} this week</span>
              </div>
              <h3>{d.name}</h3>
              {d.new_today[0] ? (
                <p className="small" style={{ margin: 0 }}>{d.new_today[0].title} · <span className="rupees">{inr(d.new_today[0].rupees)}</span></p>
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
