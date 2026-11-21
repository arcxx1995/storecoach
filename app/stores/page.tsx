import Link from "next/link";
import { readRun, resolveDate, type Card } from "@/lib/data";
import { Header } from "../ui";

export default async function Stores({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { idx, date } = await resolveDate((await searchParams).date);
  const cards = (await readRun<{ cards: Card[] }>(`${date}/cards.json`))?.cards ?? [];
  const byStore = Object.groupBy(cards, (c) => c.store_id);
  return (
    <>
      <Header date={date} dates={idx.dates} path="/stores" />
      <h1>Salesperson cards</h1>
      <p className="sub">One behaviour, one peer from the same store, one action for today. 60 words or fewer.</p>
      <div className="grid">
        {Object.entries(byStore).sort().map(([s, cs]) => (
          <Link key={s} href={`/stores/${s}?date=${date}`} className="panel" style={{ textDecoration: "none" }}>
            <h3>{s}</h3>
            <p className="small" style={{ margin: 0 }}>{cs![0].city} · {cs!.length} cards today</p>
          </Link>
        ))}
      </div>
    </>
  );
}
