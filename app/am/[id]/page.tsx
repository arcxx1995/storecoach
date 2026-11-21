import Link from "next/link";
import { notFound } from "next/navigation";
import { cityOf, conv, inr, num, pct, perMonth, readRun, resolveRange, type SP, series, short, sum, type Card, type Digest, type Meta, type Issue, type StoreMetric } from "@/lib/data";
import { Bars, C, HBars, Kpi, Line, change } from "../../charts";
import { Audio, Fallback, FollowupRow, Header, IssueCard } from "../../ui";
import Chat from "./chat";

export default async function AreaManager({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<SP>;
}) {
  const { id } = await params;
  const { idx, date, from, to, q } = await resolveRange(await searchParams);
  const run = await readRun<{ meta: Meta; digests: Record<string, Digest> }>(`${date}/digests.json`);
  const sv = !!run?.meta.sarvam; // badge only on days Sarvam ran
  const d = run?.digests[id];
  if (!d) notFound();
  const cards = await readRun<{ cards: Card[] }>(`${date}/cards.json`);
  const stores = [...new Set((cards?.cards ?? []).filter((c) => c.city === d.city).map((c) => c.store_id))].sort();
  const [sm, is] = await Promise.all([
    series<{ rows: StoreMetric[] }>(idx.dates, date, "store_metrics.json", from),
    series<{ issues: Issue[] }>(idx.dates, date, "issues.json", from),
  ]);
  const mine = (i: number) => (sm[i]?.data?.rows ?? []).filter((r) => cityOf(r.store_id) === d.city);
  const labels = sm.map((s) => short(s.date));
  const n = sm.length - 1, w = 0; // KPI change is range end vs range start
  const vs = labels[0] ?? "";
  const rev = sm.map((_, i) => sum(mine(i).map((r) => r.revenue)));
  const bills = sm.map((_, i) => sum(mine(i).map((r) => r.bills)));
  const cv = sm.map((_, i) => conv(mine(i)));
  const iss = is.map((s) => (s.data?.issues ?? []).filter((i) => i.am_id === id));
  const issN = iss.map((x) => x.length), issR = iss.map((x) => perMonth(sum(x.map((i) => i.rupees))));
  const storeIds = mine(n).map((r) => r.store_id).sort();

  return (
    <>
      <Header from={from} to={to} dates={idx.dates} path={`/am/${id}`} />
      <h1>{d.name}</h1>
      <p className="sub">Area manager, {d.city} · stores: {stores.map((s, n) => (
        <span key={s}>{n > 0 && ", "}<Link href={`/stores/${s}?${q}`}>{s}</Link></span>))}</p>

      <div className="panel">
        <div className="chips"><span className="small">Morning briefing</span><Fallback on={sv && !d.briefing_local} /></div>
        <p className="local" style={{ margin: "6px 0" }}>{d.briefing_local ?? d.briefing_en}</p>
        <Audio src={d.briefing_audio} date={date} am={id} />
        {d.briefing_local && <details><summary>English</summary><p>{d.briefing_en}</p></details>}
      </div>

      <h2>Daily analytics · {d.city}</h2>
      <div className="grid kpis">
        <Kpi label="Revenue (28 days)" value={inr(rev[n] ?? 0)} delta={change(rev[n], rev[w])} pts={rev} vs={vs} />
        <Kpi label="Walk-in conversion" value={pct(cv[n])} delta={change(cv[n], cv[w])} pts={cv} vs={vs} />
        <Kpi label="Bills (28 days)" value={num(bills[n] ?? 0)} delta={change(bills[n], bills[w])} pts={bills} vs={vs} />
        <Kpi label="₹ at stake (per month)" value={inr(issR[n] ?? 0)} delta={change(issR[n], issR[w])} pts={issR} vs={vs} goodUp={false} />
      </div>
      <div className="grid two" style={{ marginTop: 14 }}>
        <section className="panel" data-reveal>
          <div className="ph"><h3>Conversion by store</h3></div>
          <Line labels={labels} fmt={(v) => pct(v)} series={storeIds.map((sid) => ({ name: sid, pts: sm.map((s) => s.data?.rows.find((r) => r.store_id === sid)?.conversion ?? null) }))} />
          <p className="note">Gaps are days with a broken footfall counter.</p>
        </section>
        <section className="panel" data-reveal>
          <div className="ph"><h3>Revenue by store</h3></div>
          <Line labels={labels} fmt={inr} series={storeIds.map((sid) => ({ name: sid, pts: sm.map((s) => s.data?.rows.find((r) => r.store_id === sid)?.revenue ?? null) }))} />
        </section>
        <section className="panel" data-reveal>
          <div className="ph"><h3>Issues found per day</h3></div>
          <Bars items={is.map((s, i) => ({ label: short(s.date), value: issN[i] }))} fmt={num} color={C[3]} />
        </section>
        <section className="panel" data-reveal>
          <div className="ph"><h3>₹ at stake per day</h3></div>
          <Bars items={is.map((s, i) => ({ label: short(s.date), value: issR[i] }))} fmt={inr} color={C[2]} />
        </section>
        <section className="panel" data-reveal>
          <div className="ph"><h3>Stores ranked by revenue</h3></div>
          <HBars fmt={inr} items={[...mine(n)].sort((a, b) => b.revenue - a.revenue).map((r) => ({ label: r.store_id, value: r.revenue, href: `/stores/${r.store_id}?${q}` }))} />
        </section>
      </div>

      <h2>New today ({d.new_today.length})</h2>
      {d.new_today.length ? <div className="grid">{d.new_today.map((i) => <IssueCard key={i.key} i={i} fb={sv} />)}</div>
        : <p className="empty">Nothing new. {d.held_back > 0 ? `${d.held_back} more found but held back by the weekly cap.` : ""}</p>}

      {d.earlier_this_week.length > 0 && (<>
        <h2>Earlier this week</h2>
        <div className="grid">{d.earlier_this_week.map((i) => <IssueCard key={i.key + i.sent_on} i={i} fb={sv} />)}</div>
      </>)}

      <h2>Did last week&apos;s alerts move the number?</h2>
      {d.followups.length ? <div className="grid">{d.followups.map((f) => <FollowupRow key={f.key + f.alerted_on} f={f} />)}</div>
        : <p className="empty">No follow-ups due today.</p>}

      {d.role_models.length > 0 && (<>
        <h2>Role models: customers come back</h2>
        <div className="grid">{d.role_models.map((m) => (
          <div className="panel" key={m.salesperson_id}>
            <h3>{m.name} · {m.store_id}</h3>
            <p className="small" style={{ margin: 0 }}>{(m.repeat_rate * 100).toFixed(1)}% of {m.customers} customers came back, vs {(m.store_rate * 100).toFixed(1)}% for the rest of the store. Ask them to share how they follow up.</p>
          </div>))}</div>
      </>)}

      {d.notes.length > 0 && (<>
        <h2>Low priority</h2>
        {d.notes.map((n) => <div className="panel small" key={n}>{n}</div>)}
      </>)}

      <h2>Ask the coach</h2>
      <Chat date={date} amId={id} />
    </>
  );
}
