import { readRun, resolveRange, type SP, type DataIssue, type Digest } from "@/lib/data";
import { Header } from "../ui";

const LABEL: Record<string, string> = {
  footfall_zero_with_bills: "Door camera counted 0 walk-ins on days with bills",
  bills_exceed_footfall: "More bills than walk-ins",
  placeholder_customer_id: "Dummy mobile number on bills",
  new_store_no_baseline: "New store: no history to compare",
  salesperson_no_bills: "On the staff list but never billed",
  item_missing_launch_date: "Product missing a launch date",
};

export default async function DataIssues({ searchParams }: { searchParams: Promise<SP> }) {
  const { idx, date, from, to, q } = await resolveRange(await searchParams);
  const rows = (await readRun<{ rows: DataIssue[] }>(`${date}/data_issues.json`))?.rows ?? [];
  const [sent, dg, subs] = await Promise.all([
    readRun<Record<string, { status: string; at: string; error?: string }>>(`${date}/delivered.json`),
    readRun<{ digests: Record<string, Digest> }>(`${date}/digests.json`),
    Promise.all(Array.from({ length: 6 }, (_, i) => `AM-0${i + 1}`).map(async (id) => [id, await readRun<{ chat_id: number }>(`subscribers/${id}.json`)] as const)),
  ]);
  const connected = new Set(subs.filter(([, v]) => v).map(([id]) => id));
  return (
    <>
      <Header from={from} to={to} dates={idx.dates} path="/data" />
      <h1>Data issues</h1>
      <p className="sub">Numbers that can&apos;t be right. These are kept out of the maths and never sent to an area manager as an alert.</p>
      <h2>Telegram delivery · {date}</h2>
      <div className="panel tablewrap">
        <table className="stack">
          <thead><tr><th>Area manager</th><th>Telegram</th><th>Status</th><th>Sent at</th></tr></thead>
          <tbody>
            {Object.values(dg?.digests ?? {}).map((d) => {
              const r = sent?.[d.am_id];
              return (
                <tr key={d.am_id}>
                  <td className="issue-cell">{d.name}<div className="small">{d.city}</div></td>
                  <td data-label="Telegram"><span className={`chip ${connected.has(d.am_id) ? "ok" : ""}`}>{connected.has(d.am_id) ? "Connected" : "Not connected"}</span></td>
                  <td data-label="Status"><span className={`chip ${r?.status === "ok" ? "ok" : r ? "bad" : ""}`}>{r ? (r.status === "ok" ? "Delivered" : "Failed") : "Not sent"}</span>{r?.error && <div className="small">{r.error}</div>}</td>
                  <td data-label="Sent at">{r?.at ? new Date(r.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <h2>Data issues</h2>
      <div className="grid">
        {rows.map((r, n) => (
          <div className="panel" key={n}>
            <div className="chips">{r.store_id && <span className="chip">{r.store_id}</span>}</div>
            <h3>{LABEL[r.type] ?? r.type}</h3>
            {r.note && <p className="small" style={{ margin: "0 0 8px" }}>{r.note}</p>}
            <pre className="small" style={{ whiteSpace: "pre-wrap", margin: 0 }}>
              {Object.entries(r).filter(([k]) => !["type", "note", "store_id"].includes(k)).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`).join("\n")}
            </pre>
          </div>
        ))}
      </div>
    </>
  );
}
