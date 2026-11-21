import { perMonth, inr, readRun, resolveRange, severity, SEV, type SP, type Digest, type Issue } from "@/lib/data";
import { DataTable, type Row } from "../datatable";
import { Header } from "../ui";

export default async function Issues({ searchParams }: { searchParams: Promise<SP> }) {
  const { idx, date, from, to, q } = await resolveRange(await searchParams);
  const issues = (await readRun<{ issues: Issue[] }>(`${date}/issues.json`))?.issues ?? [];
  const dg = (await readRun<{ digests: Record<string, Digest> }>(`${date}/digests.json`))?.digests ?? {};
  const sent = new Set(Object.values(dg).flatMap((d) => [...d.new_today, ...d.earlier_this_week].map((i) => i.key)));
  const rows: Row[] = issues.map((i) => {
    const m = perMonth(i.rupees), lv = severity(m);
    return {
      id: i.key,
      cells: {
        sev: { sort: lv, level: lv, text: SEV[lv - 1] },
        rupees: { sort: m, text: inr(m) },
        lever: { sort: i.lever, text: i.lever },
        issue: { sort: i.title, text: i.title, sub: i.cause },
        am: { sort: dg[i.am_id]?.name ?? i.am_id, text: dg[i.am_id]?.name ?? i.am_id, href: `/am/${i.am_id}?${q}` },
        status: { sort: 0, text: sent.has(i.key) ? "Sent this week" : i.rupees < 5000 ? "Card only" : "Held back (cap or cooldown)" },
      },
    };
  });
  return (
    <>
      <Header from={from} to={to} dates={idx.dates} path="/issues" />
      <h1>Issues</h1>
      <p className="sub">Every problem found, ranked by ₹ at stake per month. Only the top few reach managers; gaps under ₹5k go to salesperson cards. Severity: Low under ₹20k, Medium ₹20k+, High ₹50k+, Critical ₹1L+.</p>
      <DataTable
        cols={[
          { key: "sev", label: "Severity", kind: "meter", filter: true },
          { key: "rupees", label: "₹ / month", kind: "num" },
          { key: "lever", label: "Lever", kind: "text", filter: true },
          { key: "issue", label: "Issue", kind: "issue" },
          { key: "am", label: "Manager", kind: "link", filter: true },
          { key: "status", label: "Status", kind: "text", filter: true },
        ]}
        rows={rows}
        defaultSort={{ key: "rupees", dir: "desc" }}
      />
    </>
  );
}
