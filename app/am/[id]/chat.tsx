"use client";
import { useState } from "react";

export default function Chat({ date, amId }: { date: string; amId: string }) {
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [audio, setAudio] = useState("");
  const [refused, setRefused] = useState(false);

  async function speak() {
    setAudio("");
    const r = await fetch("/api/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: answer }) });
    if (r.ok) setAudio(URL.createObjectURL(await r.blob()));
  }

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setAnswer("");
    setAudio("");
    setRefused(false);
    try {
      const r = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ date, amId, question: q }) });
      const j = await r.json();
      setAnswer(j.answer ?? j.error ?? "Something went wrong.");
      setRefused(!!j.refused);
    } catch {
      setAnswer("Couldn't reach the coach. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel chat" onSubmit={ask}>
      <label htmlFor="q" className="small">Answers come only from today&apos;s numbers. Ask in Hindi, Kannada or English.</label>
      <textarea id="q" value={q} onChange={(e) => setQ(e.target.value)} maxLength={500}
        placeholder="Why is LKO-02 on my list? Who should Sumit call first?" />
      <button disabled={busy || !q.trim()}>{busy ? "Thinking…" : "Ask"}</button>
      {answer && <div className="answer" aria-live="polite">{answer}</div>}
      {refused && <p className="small">Not in today&apos;s data. Try a question about your stores, team or issues.</p>}
      {answer && <button type="button" onClick={speak}>Listen</button>}
      {audio && <audio controls autoPlay src={audio} />}
    </form>
  );
}
