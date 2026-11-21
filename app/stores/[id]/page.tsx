import { readRun, resolveDate, type Card } from "@/lib/data";
import { Audio, Header } from "../../ui";

export default async function StoreCards({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ date?: string }>;
}) {
  const { id } = await params;
  const { idx, date } = await resolveDate((await searchParams).date);
  const cards = ((await readRun<{ cards: Card[] }>(`${date}/cards.json`))?.cards ?? []).filter((c) => c.store_id === id);
  return (
    <>
      <Header date={date} dates={idx.dates} path={`/stores/${id}`} />
      <h1>{id} · today&apos;s cards</h1>
      <p className="sub">{cards[0]?.city} · {cards.length} salespeople on the floor recently</p>
      <div className="grid">
        {cards.map((c) => (
          <article className="panel" key={c.salesperson_id}>
            <div className="chips">
              <span className="chip lever">{c.behaviour}</span>
              {c.peer_name && <span className="chip">peer: {c.peer_name}</span>}
            </div>
            <h3>{c.name}</h3>
            <p className="local" style={{ margin: "6px 0" }}>{c.text_local ?? c.text_en}</p>
            <Audio src={c.audio} />
            {c.text_local && <details><summary>English</summary><p>{c.text_en}</p></details>}
          </article>
        ))}
      </div>
    </>
  );
}
