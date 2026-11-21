import Link from "next/link";
import { inr, readRun, resolveRange, type SP, type Digest, type Issue } from "@/lib/data";
import { Header } from "../ui";

export default async function Issues({ searchParams }: { searchParams: Promise<SP> }) {
  const { idx, date, from, to, q } = await resolveRange(await searchParams);
  const issues = (await readRun<{ issues: Issue[] }>(`${date}/issues.json`))?.issues ?? [];
  const dg = (await readRun<{ digests: Record<string, Digest> }>(`${date}/digests.json`))?.digests ?? {};
  const sent = new Set(Object.values(dg).flatMap((d) => [...d.new_today, ...d.earlier_this_week].map((i) => i.key)));
  return (
    <>
      <Header from={from} to={to} dates={idx.dates} path="/issues" />
      <h1>Everything found</h1>
      <p className="sub">Every problem the detectors found, ranked by ₹ at stake. Only the top few reach area managers. Gaps under ₹5k go to the salesperson&apos;s card instead.</p>
      <div className="panel tablewrap">
        <table className="stack">
          <thead><tr><th>₹ / 4 wks</th><th>Lever</th><th>Issue</th><th>Manager</th><th>Status</th></tr></thead>
          <tbody>
            {issues.map((i) => (
              <tr key={i.key}>
                <td className="num rupees" data-label="₹ / 4 wks">{inr(i.rupees)}</td>
                <td data-label="Lever">{i.lever}</td>
                <td className="issue-cell">{i.title}<div className="small">{i.cause}</div></td>
                <td data-label="Manager"><Link href={`/am/${i.am_id}?${q}`}>{dg[i.am_id]?.name ?? i.am_id}</Link></td>
                <td data-label="Status">{sent.has(i.key) ? "Sent this week" : i.rupees < 5000 ? "Card only" : "Held back (cap or cooldown)"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
