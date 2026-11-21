"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

const I = (d: string) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
);
const LINKS = [
  ["/", "Dashboard", "M3 13h8V3H3zM13 21h8V11h-8zM13 3v6h8V3zM3 21h8v-6H3z"],
  ["/am", "Area managers", "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"],
  ["/stores", "Stores", "M3 9l1-5h16l1 5M3 9v11h18V9M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0M9 20v-6h6v6"],
  ["/issues", "Issues", "M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"],
  ["/followups", "Follow-ups", "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2"],
  ["/employees", "Employees", "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"],
  ["/data", "Data issues", "M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3zM4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"],
] as const;

function Links({ onGo }: { onGo: () => void }) {
  const p = usePathname();
  const sp = useSearchParams();
  const qs = sp.get("from") && sp.get("to") ? `?from=${sp.get("from")}&to=${sp.get("to")}` : "";
  const on = (h: string) => (h === "/" ? p === "/" : p.startsWith(h));
  return (
    <nav aria-label="Sections">
      {LINKS.map(([h, t, d]) => (
        <Link key={h} href={`${h}${qs}`} aria-current={on(h) ? "page" : undefined} title={t} onClick={onGo}>
          {I(d)}<span>{t}</span>
        </Link>
      ))}
    </nav>
  );
}

export function Sidebar() {
  const [mini, setMini] = useState(false);
  const [open, setOpen] = useState(false); // mobile drawer
  useEffect(() => { try { setMini(localStorage.getItem("sc-nav") === "mini"); } catch {} }, []);
  const toggle = () => setMini((m) => { try { localStorage.setItem("sc-nav", m ? "full" : "mini"); } catch {} return !m; });
  return (
    <>
      <button className="burger" onClick={() => setOpen(true)} aria-label="Open menu">{I("M4 6h16M4 12h16M4 18h16")}</button>
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <aside className="side" data-mini={mini} data-open={open}>
        <div className="side-head">
          <Link href="/" className="brand" aria-label="Store Coach home">
            <Image className="full" src="/manyavar-logo.png" alt="Manyavar" width={120} height={30} priority />
            <Image className="mark" src="/manyavar-mark.png" alt="" width={24} height={30} priority />
            <span>Store Coach</span>
          </Link>
        </div>
        <Suspense fallback={<nav />}><Links onGo={() => setOpen(false)} /></Suspense>
        <button className="collapse" onClick={toggle} aria-label={mini ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!mini}>
          {I(mini ? "M9 18l6-6-6-6" : "M15 18l-6-6 6-6")}<span>Collapse</span>
        </button>
      </aside>
    </>
  );
}
