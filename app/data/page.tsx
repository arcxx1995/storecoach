import { readRun, resolveDate, type DataIssue } from "@/lib/data";
import { Header } from "../ui";

const LABEL: Record<string, string> = {
  footfall_zero_with_bills: "Door camera counted 0 walk-ins on days with bills",
  bills_exceed_footfall: "More bills than walk-ins",
  placeholder_customer_id: "Dummy mobile number on bills",
  new_store_no_baseline: "New store: no history to compare",
  salesperson_no_bills: "On the staff list but never billed",
  item_missing_launch_date: "Product missing a launch date",
};

export default async function DataIssues({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { idx, date } = await resolveDate((await searchParams).date);
  const rows = (await readRun<{ rows: DataIssue[] }>(`${date}/data_issues.json`))?.rows ?? [];
  return (
    <>
      <Header date={date} dates={idx.dates} path="/data" />
      <h1>Data issues</h1>
      <p className="sub">Numbers that can&apos;t be right. These are kept out of the maths and never sent to an area manager as an alert.</p>
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
