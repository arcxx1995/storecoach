import { readRun, resolveRange, type SP, type Followup } from "@/lib/data";
import { FollowupRow, Header } from "../ui";

export default async function Followups({ searchParams }: { searchParams: Promise<SP> }) {
  const { idx, date, from, to, q } = await resolveRange(await searchParams);
  const upTo = idx.dates.filter((d) => d <= date);
  const all = (await Promise.all(upTo.map((d) => readRun<{ followups: Followup[] }>(`${d}/followups.json`))))
    .flatMap((r) => r?.followups ?? []).reverse();
  const counts = all.reduce<Record<string, number>>((m, f) => ((m[f.status] = (m[f.status] ?? 0) + 1), m), {});
  return (
    <>
      <Header from={from} to={to} dates={idx.dates} path="/followups" />
      <h1>Follow-ups</h1>
      <p className="sub">
        Each alert re-measured a week later: {counts.improved ?? 0} improved, {counts.flat ?? 0} not moved, {counts.worse ?? 0} worse, {counts.too_early ?? 0} too early.
      </p>
      <div className="grid">{all.map((f) => <FollowupRow key={f.key + f.alerted_on} f={f} />)}</div>
    </>
  );
}
