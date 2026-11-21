import { day, inr, perMonth, readRun, resolveRange, urgency, URG, type SP, type Digest, type Followup, type Issue } from "@/lib/data";
import { DataTable, type Row } from "../datatable";
import { Header } from "../ui";

const STATUS: Record<string, string> = { improved: "Improved", worse: "Got worse", flat: "Not moved", too_early: "Too early to tell" };

export default async function Followups({ searchParams }: { searchParams: Promise<SP> }) {
  const { idx, date, from, to, q } = await resolveRange(await searchParams);
  const upTo = idx.dates.filter((d) => d <= date);
  // one row per alert: a "too early" check is replaced by its later result
  const all = [...new Map((await Promise.all(upTo.map((d) => readRun<{ followups: Followup[] }>(`${d}/followups.json`))))
    .flatMap((r) => r?.followups ?? []).map((f) => [f.key + f.alerted_on, f])).values()];
  // ₹, lever and manager name come from the original alert
  const alertDays = [...new Set(all.map((f) => f.alerted_on))];
  const orig = new Map((await Promise.all(alertDays.map(async (d) => [d, await readRun<{ issues: Issue[] }>(`${d}/issues.json`)] as const)))
    .flatMap(([d, r]) => (r?.issues ?? []).map((i) => [d + i.key, i] as const)));
  const names = (await readRun<{ digests: Record<string, Digest> }>(`${date}/digests.json`))?.digests ?? {};
  const counts = all.reduce<Record<string, number>>((m, f) => ((m[f.status] = (m[f.status] ?? 0) + 1), m), {});

  const rows: Row[] = all.map((f) => {
    const i = orig.get(f.alerted_on + f.key);
    const m = i ? perMonth(i.rupees) : null, u = urgency(f.status, m);
    const fmt = (x: number | null) => (x == null ? "—" : `${(x * 100).toFixed(1)}%`);
    return {
      id: f.key + f.alerted_on,
      cells: {
        urg: { sort: u, level: u, text: URG[u] },
        issue: { sort: f.title, text: f.title, sub: f.summary.replace(`${f.title}: `, "") },
        am: { sort: names[f.am_id]?.name ?? f.am_id, text: names[f.am_id]?.name ?? f.am_id, href: `/am/${f.am_id}?${q}` },
        lever: { sort: i?.lever ?? "", text: i?.lever ?? "—" },
        alerted: { sort: f.alerted_on, text: day(f.alerted_on) },
        change: { sort: f.after != null && f.before != null ? f.after - f.before : 0, text: `${fmt(f.before)} → ${fmt(f.after)}` },
        status: { sort: u, text: STATUS[f.status] ?? f.status },
        rupees: { sort: m ?? 0, text: m == null ? "—" : inr(m) },
      },
    };
  });
  return (
    <>
      <Header from={from} to={to} dates={idx.dates} path="/followups" />
      <h1>Follow-ups</h1>
      <p className="sub">
        Each alert re-measured a week later: {counts.improved ?? 0} improved, {counts.flat ?? 0} not moved, {counts.worse ?? 0} worse, {counts.too_early ?? 0} too early.
        Urgency: worse and not-moved alerts rank highest, and rise a level when the issue is ₹50k+ a month.
      </p>
      <DataTable
        cols={[
          { key: "urg", label: "Urgency", kind: "meter", filter: true },
          { key: "issue", label: "Issue", kind: "issue" },
          { key: "am", label: "Manager", kind: "link", filter: true },
          { key: "lever", label: "Lever", kind: "text", filter: true },
          { key: "alerted", label: "Alerted", kind: "text" },
          { key: "change", label: "Before → after", kind: "text" },
          { key: "status", label: "Status", kind: "text", filter: true },
          { key: "rupees", label: "₹ / month", kind: "num" },
        ]}
        rows={rows}
        defaultSort={{ key: "urg", dir: "desc" }}
      />
    </>
  );
}
