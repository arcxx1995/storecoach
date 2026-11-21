import Link from "next/link";
import { CITY, cityOf, inr, perMonth, readRun, resolveRange, type SP, sum, type Card, type Digest, type Issue } from "@/lib/data";
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
  const cities = Object.values(CITY).filter((c) => Object.keys(byStore).some((s) => cityOf(s) === c));
  const sp = await searchParams;
  const city = cities.find((c) => c === sp.city) ?? cities[0];
  const stores = Object.keys(byStore).filter((s) => cityOf(s) === city).sort();
  const am = ams.find((a) => a.city === city);
  return (
    <>
      <Header from={from} to={to} dates={idx.dates} path="/stores" />
      <section className="hero" data-hero>
        <h1>Stores</h1>
        <p className="sub">One behaviour, one peer, one action per card. Pick a city.</p>
      </section>
      <nav className="pills" aria-label="City">
        {cities.map((c) => (
          <Link key={c} href={`/stores?${q}&city=${c}`} aria-current={c === city ? "true" : undefined}>{c}</Link>
        ))}
      </nav>
      {am && (
        <p className="small" style={{ margin: "0 0 12px" }}>
          Area manager <Link href={`/am/${am.am_id}?${q}`}><b>{am.name}</b></Link> · {stores.length} stores
        </p>
      )}
      <div className="panel rows">
        {stores.map((s) => {
          const risk = perMonth(sum(issues.filter((i) => i.store_id === s).map((i) => i.rupees)));
          return (
            <Link key={s} href={`/stores/${s}?${q}`}>
              <b>{s}</b>
              <span className="small">{byStore[s]!.length} cards{risk ? ` · ${inr(risk)} at stake` : ""}</span>
            </Link>
          );
        })}
      </div>
    </>
  );
}
