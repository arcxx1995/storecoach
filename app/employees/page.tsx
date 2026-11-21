import { CITY, cityOf, readRun, resolveRange, type SP, type Card, type Digest } from "@/lib/data";
import { Header } from "../ui";

export default async function Employees({ searchParams }: { searchParams: Promise<SP> }) {
  const { idx, date, from, to } = await resolveRange(await searchParams);
  const [sent, dg, cr, subs] = await Promise.all([
    readRun<Record<string, { status: string; at: string; error?: string }>>(`${date}/delivered.json`),
    readRun<{ digests: Record<string, Digest> }>(`${date}/digests.json`),
    readRun<{ cards: Card[] }>(`${date}/cards.json`),
    Promise.all(Array.from({ length: 6 }, (_, i) => `AM-0${i + 1}`).map(async (id) => [id, await readRun<{ chat_id: number }>(`subscribers/${id}.json`)] as const)),
  ]);
  const connected = new Set(subs.filter(([, v]) => v).map(([id]) => id));
  const stores = new Set((cr?.cards ?? []).map((c) => c.store_id));
  const digests = Object.values(dg?.digests ?? {});
  return (
    <>
      <Header from={from} to={to} dates={idx.dates} path="/employees" />
      <section className="hero" data-hero>
        <h1>Employees</h1>
        <p className="sub">{digests.length} area managers. Daily digest status for {date}.</p>
      </section>
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
    </>
  );
}
