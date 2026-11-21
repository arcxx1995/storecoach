import { readRun, resolveDate, type Followup } from "@/lib/data";
import { FollowupRow, Header } from "../ui";

export default async function Followups({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { idx, date } = await resolveDate((await searchParams).date);
  const upTo = idx.dates.filter((d) => d <= date);
  const all = (await Promise.all(upTo.map((d) => readRun<{ followups: Followup[] }>(`${d}/followups.json`))))
    .flatMap((r) => r?.followups ?? []).reverse();
  const counts = all.reduce<Record<string, number>>((m, f) => ((m[f.status] = (m[f.status] ?? 0) + 1), m), {});
  return (
    <>
      <Header date={date} dates={idx.dates} path="/followups" />
      <h1>Follow-ups</h1>
      <p className="sub">
        A week after each alert, the coach re-measures the same number for the 7 days since. So far:{" "}
        {counts.improved ?? 0} improved, {counts.flat ?? 0} not moved, {counts.worse ?? 0} got worse, {counts.too_early ?? 0} too early to tell.
      </p>
      <div className="grid">{all.map((f) => <FollowupRow key={f.key + f.alerted_on} f={f} />)}</div>
    </>
  );
}
