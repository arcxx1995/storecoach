"use client";
import { usePathname, useRouter } from "next/navigation";

// ponytail: browser history back/forward; no custom stack.
export function NavButtons() {
  const r = useRouter();
  if (usePathname() === "/") return null;
  return (
    <div className="navbtns">
      <button onClick={() => r.back()} aria-label="Go back">← Back</button>
      <button onClick={() => r.forward()} aria-label="Go forward">Forward →</button>
    </div>
  );
}
