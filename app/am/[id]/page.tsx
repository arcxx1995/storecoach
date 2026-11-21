import Link from "next/link";
import { notFound } from "next/navigation";
import { readRun, resolveDate, type Card, type Digest } from "@/lib/data";
import { Audio, FollowupRow, Header, IssueCard } from "../../ui";
import Chat from "./chat";

export default async function AreaManager({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ date?: string }>;
}) {
  const { id } = await params;
  const { idx, date } = await resolveDate((await searchParams).date);
  const run = await readRun<{ digests: Record<string, Digest> }>(`${date}/digests.json`);
  const d = run?.digests[id];
  if (!d) notFound();
  const cards = await readRun<{ cards: Card[] }>(`${date}/cards.json`);
  const stores = [...new Set((cards?.cards ?? []).filter((c) => c.city === d.city).map((c) => c.store_id))].sort();

  return (
    <>
      <Header date={date} dates={idx.dates} path={`/am/${id}`} />
      <h1>{d.name}</h1>
      <p className="sub">Area manager, {d.city} · stores: {stores.map((s, n) => (
        <span key={s}>{n > 0 && ", "}<Link href={`/stores/${s}?date=${date}`}>{s}</Link></span>))}</p>

      <div className="panel">
        <div className="small">Morning briefing</div>
        <p className="local" style={{ margin: "6px 0" }}>{d.briefing_local ?? d.briefing_en}</p>
        <Audio src={d.briefing_audio} />
        {d.briefing_local && <details><summary>English</summary><p>{d.briefing_en}</p></details>}
      </div>

      <h2>New today ({d.new_today.length})</h2>
      {d.new_today.length ? <div className="grid">{d.new_today.map((i) => <IssueCard key={i.key} i={i} />)}</div>
        : <p className="empty">Nothing new. {d.held_back > 0 ? `${d.held_back} more found but held back by the weekly cap.` : ""}</p>}

      {d.earlier_this_week.length > 0 && (<>
        <h2>Earlier this week</h2>
        <div className="grid">{d.earlier_this_week.map((i) => <IssueCard key={i.key + i.sent_on} i={i} />)}</div>
      </>)}

      <h2>Did last week&apos;s alerts move the number?</h2>
      {d.followups.length ? <div className="grid">{d.followups.map((f) => <FollowupRow key={f.key} f={f} />)}</div>
        : <p className="empty">No alerts from exactly a week ago.</p>}

      {d.role_models.length > 0 && (<>
        <h2>Role models: customers come back</h2>
        <div className="grid">{d.role_models.map((m) => (
          <div className="panel" key={m.salesperson_id}>
            <h3>{m.name} · {m.store_id}</h3>
            <p className="small" style={{ margin: 0 }}>{(m.repeat_rate * 100).toFixed(1)}% of {m.customers} customers came back, vs {(m.store_rate * 100).toFixed(1)}% for the rest of the store. Ask them to share how they follow up.</p>
          </div>))}</div>
      </>)}

      {d.notes.length > 0 && (<>
        <h2>Low priority</h2>
        {d.notes.map((n) => <div className="panel small" key={n}>{n}</div>)}
      </>)}

      <h2>Ask the coach</h2>
      <Chat date={date} amId={id} />
    </>
  );
}
