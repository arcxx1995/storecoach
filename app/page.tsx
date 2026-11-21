import { C, Bars, Donut, HBars, Kpi, Line, change } from "./charts";
import { Header } from "./ui";
import {
  CITY, cityOf, conv, inr, num, pct, readRun, resolveRange, type SP, series, short, sum,
  type Digest, type Followup, type Issue, type StoreMetric,
} from "@/lib/data";

export default async function Dashboard({ searchParams }: { searchParams: Promise<SP> }) {
  const { idx, date, from, to, q } = await resolveRange(await searchParams);
  if (!date) return <p className="empty">No runs yet. Run <code>python -m engine.backfill</code>.</p>;
  const [sm, is, dg, fus] = await Promise.all([
    series<{ rows: StoreMetric[] }>(idx.dates, date, "store_metrics.json", from),
    series<{ issues: Issue[] }>(idx.dates, date, "issues.json", from),
    readRun<{ digests: Record<string, Digest> }>(`${date}/digests.json`),
    series<{ followups: Followup[] }>(idx.dates, date, "followups.json", from),
  ]);
  const digests = Object.values(dg?.digests ?? {});
  const labels = sm.map((s) => short(s.date));
  const rows = (s: (typeof sm)[number]) => s.data?.rows ?? [];

  const revenue = sm.map((s) => sum(rows(s).map((r) => r.revenue)));
  const bills = sm.map((s) => sum(rows(s).map((r) => r.bills)));
  const convS = sm.map((s) => conv(rows(s)));
  const issueN = is.map((s) => s.data?.issues.length ?? 0);
  const issueR = is.map((s) => sum((s.data?.issues ?? []).map((i) => i.rupees)));
  const abv = sm.map((s) => { const b = sum(rows(s).map((r) => r.bills)); return b ? sum(rows(s).map((r) => r.revenue)) / b : null; });
  const n = sm.length - 1, w = 0; // KPI change is range end vs range start
  const vs = labels[0] ?? "";

  const todayRows = rows(sm[n] ?? { date, data: null });
  // every issue found in the range, once (latest sighting wins)
  const todayIssues = [...new Map(is.flatMap((r) => r.data?.issues ?? []).map((i) => [i.key, i])).values()];
  const followups = [...new Map(fus.flatMap((r) => r.data?.followups ?? []).map((f) => [f.key + f.alerted_on, f])).values()];
  const byLever = Object.entries(Object.groupBy(todayIssues, (i) => i.lever))
    .map(([k, v]) => ({ label: k, value: sum(v!.map((i) => i.rupees)), sub: `${v!.length} issue${v!.length > 1 ? "s" : ""}` }))
    .sort((a, b) => b.value - a.value);
  const cities = Object.values(CITY);
  const cityIdx = (c: string) => cities.indexOf(c);
  const am = (c: string) => digests.find((d) => d.city === c);
  const stat = (s: string) => followups.filter((f) => f.status === s).length;
  const top = [...todayIssues].sort((a, b) => b.rupees - a.rupees).slice(0, 5);

  return (
    <>
      <Header from={from} to={to} dates={idx.dates} path="/" />
      <section className="hero" data-hero>
        <h1>Dashboard</h1>
        <p className="sub">{todayRows.length} stores, {short(from)} to {short(date)}. Each point is a daily run over the prior 28 days, so lines are smooth. Changes compare the last run with the first.</p>
      </section>

      <div className="grid kpis">
        <Kpi label="Revenue (28 days)" value={inr(revenue[n] ?? 0)} delta={change(revenue[n], revenue[w])} pts={revenue} vs={vs} />
        <Kpi label="Walk-in conversion" value={pct(convS[n])} delta={change(convS[n], convS[w])} pts={convS} vs={vs} />
        <Kpi label="Bills (28 days)" value={num(bills[n] ?? 0)} delta={change(bills[n], bills[w])} pts={bills} vs={vs} />
        <Kpi label="Avg bill value" value={inr(abv[n] ?? 0)} delta={change(abv[n], abv[w])} pts={abv} vs={vs} />
        <Kpi label="₹ at stake (per 4 weeks)" value={inr(issueR[n] ?? 0)} delta={change(issueR[n], issueR[w])} pts={issueR} vs={vs} goodUp={false} />
      </div>

      <div className="grid two" style={{ marginTop: 14 }}>
        <section className="panel" data-reveal>
          <div className="ph"><h3>Conversion by city</h3><span className="small">bills ÷ footfall</span></div>
          <Line labels={labels} fmt={(v) => pct(v)} series={cities.map((c) => ({ name: c, pts: sm.map((s) => conv(rows(s).filter((r) => cityOf(r.store_id) === c))) }))} />
        </section>
        <section className="panel" data-reveal>
          <div className="ph"><h3>Revenue per run</h3><span className="small">all stores, 28-day window</span></div>
          <Line labels={labels} fmt={inr} series={[{ name: "Revenue", pts: revenue }]} />
        </section>
        <section className="panel" data-reveal>
          <div className="ph"><h3>Issues found per day</h3><span className="small">count</span></div>
          <Bars items={is.map((s, i) => ({ label: short(s.date), value: issueN[i] }))} fmt={num} color={C[3]} />
        </section>
        <section className="panel" data-reveal>
          <div className="ph"><h3>₹ at stake per day</h3><span className="small">sum of found issues</span></div>
          <Bars items={is.map((s, i) => ({ label: short(s.date), value: issueR[i] }))} fmt={inr} color={C[2]} />
        </section>
      </div>

      <div className="grid three" style={{ marginTop: 14 }}>
        <section className="panel" data-reveal>
          <div className="ph"><h3>Revenue by store</h3><span className="small">at {short(date)}</span></div>
          <HBars fmt={inr} items={[...todayRows].sort((a, b) => b.revenue - a.revenue).map((r) => ({
            label: r.store_id, sub: cityOf(r.store_id), value: r.revenue, color: C[cityIdx(cityOf(r.store_id)) % 6], href: `/stores/${r.store_id}?${q}` }))} />
        </section>
        <section className="panel" data-reveal>
          <div className="ph"><h3>₹ at stake by lever</h3><span className="small">issues in range</span></div>
          <HBars fmt={inr} items={byLever.map((l, i) => ({ ...l, color: C[i % 6] }))} />
          <div className="ph" style={{ marginTop: 22 }}><h3>Follow-up outcomes</h3><span className="small">alerts measured in range</span></div>
          <Donut parts={[
            { label: "Improved", value: stat("improved"), color: "var(--ok)" },
            { label: "Got worse", value: stat("worse"), color: "var(--bad)" },
            { label: "Not moved", value: stat("flat"), color: "var(--flat)" },
            { label: "Too early", value: stat("too_early"), color: "var(--gold-fill)" },
          ]} />
        </section>
        <section className="panel" data-reveal>
          <div className="ph"><h3>₹ at stake by area manager</h3><span className="small">issues in range</span></div>
          <HBars fmt={inr} items={cities.map((c) => ({
            label: am(c)?.name ?? c, sub: c, color: C[cityIdx(c) % 6], href: am(c) ? `/am/${am(c)!.am_id}?${q}` : undefined,
            value: sum(todayIssues.filter((i) => i.city === c).map((i) => i.rupees)) })).sort((a, b) => b.value - a.value)} />
        </section>
      </div>

      <h2>Biggest issues in this range</h2>
      <div className="panel tablewrap" data-reveal>
        <table className="stack">
          <thead><tr><th>Issue</th><th>City</th><th>Lever</th><th className="num">₹ at stake</th></tr></thead>
          <tbody>
            {top.map((i) => (
              <tr key={i.key}>
                <td className="issue-cell">{i.title}</td>
                <td data-label="City">{i.city}</td>
                <td data-label="Lever">{i.lever}</td>
                <td className="num"><span className="rupees">{inr(i.rupees)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
