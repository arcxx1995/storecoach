import { CITY, cityOf, readRun, resolveRange, type SP, type Card, type Digest, type Roster } from "@/lib/data";
import { Header } from "../ui";

export default async function Employees({ searchParams }: { searchParams: Promise<SP> }) {
  const { idx, date, from, to } = await resolveRange(await searchParams);
  const [sent, dg, cr, subs] = await Promise.all([
    readRun<Record<string, { status: string; at: string; error?: string }>>(`${date}/delivered.json`),
    readRun<{ digests: Record<string, Digest> }>(`${date}/digests.json`),
    readRun<{ cards: Card[] }>(`${date}/cards.json`),
    Promise.all(Array.from({ length: 6 }, (_, i) => `AM-0${i + 1}`).map(async (id) => [id, await readRun<{ chat_id: number }>(`subscribers/${id}.json`)] as const)),
  ]);
  const roster = await readRun<Roster>("roster.json");
  const people = roster?.salespeople ?? [];
  const [spSubs, cardSent] = await Promise.all([
    Promise.all(people.map(async (p) => [p.id, await readRun<{ chat_id: number }>(`subscribers/${p.id}.json`)] as const)),
    readRun<Record<string, { status: string; at: string; error?: string }>>(`${date}/delivered_cards.json`),
  ]);
  const spOn = new Set(spSubs.filter(([, v]) => v).map(([id]) => id));
  const hasCard = new Set((cr?.cards ?? []).map((c) => c.salesperson_id));
  const status = (id: string) => {
    const r = cardSent?.[id];
    if (r?.status === "ok") return { label: "Card delivered", cls: "ok" };
    if (r) return { label: "Failed", cls: "bad" };
    if (!spOn.has(id)) return { label: "Not connected", cls: "" };
    return hasCard.has(id) ? { label: "Connected", cls: "ok" } : { label: "No card today", cls: "" };
  };
  const byStore = Object.entries(roster?.stores ?? {}).map(([sid, s]) => ({ sid, city: s.city, rows: people.filter((p) => p.store_id === sid) })).filter((g) => g.rows.length);
  const fmt = (at?: string) => (at ? new Date(at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—");
  const connected = new Set(subs.filter(([, v]) => v).map(([id]) => id));
  const stores = new Set((cr?.cards ?? []).map((c) => c.store_id));
  const digests = Object.values(dg?.digests ?? {});
  return (
    <>
      <Header from={from} to={to} dates={idx.dates} path="/employees" />
      <section className="hero" data-hero>
        <h1>Employees</h1>
        <p className="sub">{digests.length} area managers, {people.length} salespeople ({spOn.size} connected on Telegram). Daily status for {date}.</p>
      </section>
      <h2>Area managers</h2>
      <div className="panel tablewrap">
        <table className="stack">
          <thead><tr><th>Area manager</th><th>Stores</th><th>Connected</th><th>Digest</th><th>Sent at</th></tr></thead>
          <tbody>
            {digests.map((d) => {
              const r = sent?.[d.am_id];
              const on = connected.has(d.am_id);
              return (
                <tr key={d.am_id}>
                  <td className="issue-cell">{d.name}<div className="small">{d.city}</div></td>
                  <td data-label="Stores">{[...stores].filter((s) => cityOf(s) === d.city).length}</td>
                  <td data-label="Connected"><span className={`chip ${on ? "ok" : ""}`}>{on ? "Yes" : "No"}</span></td>
                  <td data-label="Digest"><span className={`chip ${r?.status === "ok" ? "ok" : r ? "bad" : ""}`}>{r ? (r.status === "ok" ? "Delivered" : "Failed") : "Not sent"}</span>{r?.error && <div className="small">{r.error}</div>}</td>
                  <td data-label="Sent at">{r?.at ? new Date(r.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <h2>Salespeople</h2>
      {!byStore.length && <p className="sub">No roster yet. It appears after the next daily run.</p>}
      {byStore.map((g) => (
        <div className="panel tablewrap" key={g.sid}>
          <table className="stack">
            <thead><tr><th>{g.sid} · {g.city}</th><th>Status</th><th>Sent at</th></tr></thead>
            <tbody>
              {g.rows.map((p) => {
                const st = status(p.id);
                const r = cardSent?.[p.id];
                return (
                  <tr key={p.id}>
                    <td className="issue-cell">{p.name}<div className="small">{p.id}</div></td>
                    <td data-label="Status"><span className={`chip ${st.cls}`}>{st.label}</span>{r?.error && <div className="small">{r.error}</div>}</td>
                    <td data-label="Sent at">{fmt(r?.at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
}
