import Link from "next/link";
import { cityOf, conv, inr, pct, perMonth, readRun, resolveRange, type SP, series, short, type Card, type Meta, type Digest, type SalesMetric, type StoreMetric } from "@/lib/data";
import { Bilingual, Fallback, Header } from "../../ui";
import { CardFilter } from "../../cardfilter";
import { Bars, C, HBars, Kpi, Line, change } from "../../charts";

export default async function StoreCards({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<SP>;
}) {
  const { id } = await params;
  const { idx, date, from, to, q } = await resolveRange(await searchParams);
  const city = cityOf(id);
  const [cr, sm, sp, dg] = await Promise.all([
    readRun<{ meta: Meta; cards: Card[] }>(`${date}/cards.json`),
    series<{ rows: StoreMetric[] }>(idx.dates, date, "store_metrics.json", from),
    readRun<{ rows: SalesMetric[] }>(`${date}/salesperson_metrics.json`),
    readRun<{ digests: Record<string, Digest> }>(`${date}/digests.json`),
  ]);
  const cards = (cr?.cards ?? []).filter((c) => c.store_id === id);
  const am = Object.values(dg?.digests ?? {}).find((d) => d.city === city);
  const labels = sm.map((s) => short(s.date));
  const mine = (i: number) => sm[i]?.data?.rows.find((r) => r.store_id === id);
  const cityRows = (i: number) => (sm[i]?.data?.rows ?? []).filter((r) => cityOf(r.store_id) === city);
  const col = (k: keyof StoreMetric) => sm.map((_, i) => (mine(i)?.[k] as number | null | undefined) ?? null);
  const cityAvg = (k: "abv" | "items_per_bill" | "repeat_rate") =>
    sm.map((_, i) => { const v = cityRows(i).map((r) => r[k]).filter((x): x is number => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; });
  const n = sm.length - 1, w = 0; // KPI change is range end vs range start
  const vs = labels[0] ?? "";
  const now = mine(n);
  const people = (sp?.rows ?? []).filter((r) => r.store_id === id && r.bills).sort((a, b) => b.bills! - a.bills!);
  const attach = now ? ([
    ["Sherwani + safa", now.attach_sherwani_safa], ["Sherwani + mojari", now.attach_sherwani_mojari],
    ["Sherwani + mala", now.attach_sherwani_mala], ["Kurta set + jacket", now.attach_kurta_set_jacket],
  ] as [string, number | null][]).filter((a) => a[1] != null).map(([label, v]) => ({ label, value: v! })) : [];

  return (
    <>
      <Header from={from} to={to} dates={idx.dates} path={`/stores/${id}`} />
      <section className="hero" data-hero>
        <h1>{id}</h1>
        <p className="sub">{city}{am && <> · Area manager <Link href={`/am/${am.am_id}?${q}`}>{am.name}</Link></>} · {cards.length} cards today</p>
      </section>

      {now ? (<>
        <div className="grid kpis">
          <Kpi label="Revenue (28 days)" value={inr(now.revenue)} delta={change(now.revenue, mine(w)?.revenue)} pts={col("revenue")} vs={vs} />
          <Kpi label="Walk-in conversion" value={pct(now.conversion)} delta={change(now.conversion, mine(w)?.conversion)} pts={col("conversion")} vs={vs} />
          <Kpi label="Bills (28 days)" value={String(now.bills)} delta={change(now.bills, mine(w)?.bills)} pts={col("bills")} vs={vs} />
          <Kpi label="Items per bill" value={now.items_per_bill.toFixed(2)} delta={change(now.items_per_bill, mine(w)?.items_per_bill)} pts={col("items_per_bill")} vs={vs} />
          <Kpi label="Customers who came back" value={pct(now.repeat_rate)} delta={change(now.repeat_rate, mine(w)?.repeat_rate)} pts={col("repeat_rate")} vs={vs} />
        </div>
        <div className="grid two" style={{ marginTop: 14 }}>
          <section className="panel" data-reveal>
            <div className="ph"><h3>Conversion vs {city} stores</h3></div>
            <Line labels={labels} fmt={(v) => pct(v)} series={[{ name: id, pts: col("conversion") }, { name: `${city} average`, pts: sm.map((_, i) => conv(cityRows(i))), color: C[1] }]} />
            {now.invalid_days > 0 && <p className="note">{now.invalid_days} days left out: footfall counter not reliable.</p>}
          </section>
          <section className="panel" data-reveal>
            <div className="ph"><h3>Revenue</h3></div>
            <Line labels={labels} fmt={inr} series={[{ name: id, pts: col("revenue") }]} />
          </section>
          <section className="panel" data-reveal>
            <div className="ph"><h3>Average bill value vs {city}</h3></div>
            <Line labels={labels} fmt={inr} series={[{ name: id, pts: col("abv") }, { name: `${city} average`, pts: cityAvg("abv"), color: C[1] }]} />
          </section>
          <section className="panel" data-reveal>
            <div className="ph"><h3>Repeat customers vs {city}</h3></div>
            <Line labels={labels} fmt={(v) => pct(v)} series={[{ name: id, pts: col("repeat_rate") }, { name: `${city} average`, pts: cityAvg("repeat_rate"), color: C[1] }]} />
          </section>
          <section className="panel" data-reveal>
            <div className="ph"><h3>Bills per run</h3></div>
            <Bars items={sm.map((s, i) => ({ label: short(s.date), value: mine(i)?.bills ?? 0 }))} fmt={(v) => String(Math.round(v))} color={C[3]} />
          </section>
          <section className="panel" data-reveal>
            <div className="ph"><h3>Bills by salesperson</h3><span className="small">28 days</span></div>
            {people.length ? <HBars fmt={(v) => String(v)} items={people.map((p) => ({ label: p.name, value: p.bills!, sub: p.revenue ? inr(p.revenue) : undefined, color: C[2] }))} /> : <p className="empty small">No sales yet.</p>}
          </section>
          {attach.length > 0 && (
            <section className="panel" data-reveal>
              <div className="ph"><h3>Add-on rate</h3><span className="small">share of bills with the add-on</span></div>
              <HBars fmt={(v) => pct(v, 0)} items={attach.map((a, i) => ({ ...a, color: C[i % 6] }))} />
            </section>
          )}
        </div>
      </>) : <p className="empty">No metrics for this store on this date.</p>}

      <h2>Today&apos;s cards</h2>
      <CardFilter items={cards.map((c) => ({ id: c.salesperson_id, name: c.name, node: (
          <article className="panel scard" key={c.salesperson_id} data-reveal>
            <div className="scard-top">
              <h3>{c.name}</h3>
              {c.rupees > 0 && <span className="rupees" title="at stake per month">{inr(perMonth(c.rupees))}</span>}
            </div>
            <div className="chips">
              <span className="chip lever">{c.behaviour}</span>
              {c.peer_name && <span className="chip">peer: {c.peer_name}</span>}
              <Fallback on={!!cr?.meta.sarvam && !c.text_local} />
            </div>
            <Bilingual local={c.text_local} en={c.text_en} className="quote" audio={{ src: c.audio, date, sp: c.salesperson_id }} />
          </article>
      ) }))} />
    </>
  );
}
