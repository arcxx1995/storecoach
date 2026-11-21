"use client";
import { usePathname } from "next/navigation";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

// One orchestrated entrance per navigation: header, ₹ counters, then cards.
// Server pages just tag elements: data-count (count-up), data-reveal (stagger in).
export function Motion() {
  const path = usePathname();
  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.from(".top", { y: -16, opacity: 0, duration: 0.5 })
        .from("[data-hero]", { y: 20, opacity: 0, duration: 0.7 }, "-=0.25")
        .from("[data-reveal]", { y: 14, opacity: 0, duration: 0.5, stagger: 0.05, clearProps: "all" }, "-=0.4");
      document.querySelectorAll<HTMLElement>("[data-count]").forEach((el) => {
        const final = el.textContent ?? "";
        const m = final.match(/\d+(\.\d+)?/);
        if (!m) return;
        const n = parseFloat(m[0]);
        const dp = m[1] ? m[1].length - 1 : 0;
        const o = { v: 0 };
        gsap.to(o, {
          v: 1, duration: 1.4, ease: "power2.out", delay: 0.3,
          onUpdate: () => (el.textContent = final.replace(m[0], (n * o.v).toFixed(dp))),
          onComplete: () => (el.textContent = final), // exact server-rendered text
        });
      });
    });
    return () => mm.revert();
  }, { dependencies: [path] });
  return null;
}
