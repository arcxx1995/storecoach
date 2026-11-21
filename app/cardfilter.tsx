"use client";
import { useState, type ReactNode } from "react";

export function CardFilter({ items }: { items: { id: string; name: string; node: ReactNode }[] }) {
  const [who, setWho] = useState("");
  const shown = who ? items.filter((i) => i.id === who) : items;
  return (
    <>
      <label className="small" style={{ display: "block", margin: "0 0 12px" }}>
        Salesperson{" "}
        <select value={who} onChange={(e) => setWho(e.target.value)} style={{ font: "inherit", padding: "5px 10px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--panel)", color: "var(--ink)" }}>
          <option value="">All ({items.length})</option>
          {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
      </label>
      <div className="grid cards">
        {shown.map((i) => i.node)}
        {!shown.length && <p className="empty">No cards for this store today.</p>}
      </div>
    </>
  );
}
