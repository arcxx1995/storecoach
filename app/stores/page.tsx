import Link from "next/link";
import { CITY, cityOf, inr, readRun, resolveRange, type SP, sum, type Card, type Digest, type Issue } from "@/lib/data";
import { Header } from "../ui";

export default async function Stores({ searchParams }: { searchParams: Promise<SP> }) {
  const { idx, date, from, to, q } = await resolveRange(await searchParams);
  const [cr, dg, ir] = await Promise.all([
    readRun<{ cards: Card[] }>(`${date}/cards.json`),
    readRun<{ digests: Record<string, Digest> }>(`${date}/digests.json`),
    readRun<{ issues: Issue[] }>(`${date}/issues.json`),
  ]);
  const cards = cr?.cards ?? [], issues = ir?.issues ?? [];
  const byStore = Object.groupBy(cards, (c) => c.store_id);
  const ams = Object.values(dg?.digests ?? {});
  return (
    <>
      <Header from={from} to={to} dates={idx.dates} path="/stores" title="Salesperson cards" />
      <section className="hero" data-hero>
        <h1>Salesperson cards</h1>
        <p className="sub">One behaviour, one peer from the same store, one action for today. 60 words or fewer. Grouped by city and the area manager who owns it.</p>
      </section>
      {Object.values(CITY).map((city) => {
        const stores = Object.keys(byStore).filter((s) => cityOf(s) === city).sort();
        if (!stores.length) return null;
        const am = ams.find((a) => a.city === city);
        const total = sum(stores.map((s) => byStore[s]!.length));
        const risk = sum(issues.filter((i) => i.city === city).map((i) => i.rupees));
        return (
          <section key={city} aria-labelledby={`c-${city}`}>
            <div className="city">
              <h2 id={`c-${city}`}>{city}</h2>
              {am && <Link href={`/am/${am.am_id}?${q}`}>Area manager: {am.name}</Link>}
              <span className="small">{stores.length} stores · {total} cards · {inr(risk)} at stake</span>
            </div>
            <div className="grid">
              {stores.map((s) => (
                <Link key={s} href={`/stores/${s}?${q}`} className="panel lift" data-reveal>
                  <h3>{s}</h3>
                  <p className="small" style={{ margin: 0 }}>{byStore[s]!.length} cards today</p>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}
