"use client";
import { useState } from "react";

export default function Listen({ date, am, sp }: { date: string; am?: string; sp?: string }) {
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [src, setSrc] = useState("");
  const qs = new URLSearchParams({ date, ...(am ? { am } : { sp: sp! }) }).toString();

  async function load() {
    setState("loading");
    try {
      const r = await fetch(`/api/tts?${qs}`);
      if (!r.ok) throw new Error();
      setSrc(URL.createObjectURL(await r.blob()));
      setState("idle");
    } catch {
      setState("error");
    }
  }

  if (src) return <audio controls autoPlay src={src} />;
  return <button type="button" onClick={load} disabled={state === "loading"}>
    {state === "loading" ? "Voicing…" : state === "error" ? "Voice unavailable, retry" : "Listen"}</button>;
}
