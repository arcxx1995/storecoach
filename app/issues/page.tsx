import Link from "next/link";
import { inr, readRun, resolveDate, type Digest, type Issue } from "@/lib/data";
import { Header } from "../ui";

export default async function Issues({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { idx, date } = await resolveDate((await searchParams).date);
  const issues = (await readRun<{ issues: Issue[] }>(`${date}/issues.json`))?.issues ?? [];
  const dg = (await readRun<{ digests: Record<string, Digest> }>(`${date}/digests.json`))?.digests ?? {};
  const sent = new Set(Object.values(dg).flatMap((d) => [...d.new_today, ...d.earlier_this_week].map((i) => i.key)));
  return (
    <>
      <Header date={date} dates={idx.dates} path="/issues" />
      <h1>Everything found</h1>
      <p className="sub">Every problem the detectors found, ranked by ₹ at stake. Only the top few reach area managers. Gaps under ₹5k go to the salesperson&apos;s card instead.</p>
      <div className="panel tablewrap">
        <table>
          <thead><tr><th>₹ / 4 wks</th><th>Lever</th><th>Issue</th><th>Manager</th><th>Status</th></tr></thead>
          <tbody>
            {issues.map((i) => (
              <tr key={i.key}>
                <td className="num rupees">{inr(i.rupees)}</td>
                <td>{i.lever}</td>
                <td>{i.title}<div className="small">{i.cause}</div></td>
                <td><Link href={`/am/${i.am_id}?date=${date}`}>{dg[i.am_id]?.name ?? i.am_id}</Link></td>
                <td>{sent.has(i.key) ? "Sent this week" : i.rupees < 5000 ? "Card only" : "Held back (cap or cooldown)"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
