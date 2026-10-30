"use client";

import { useEffect, useState } from "react";

const PHASES = ["Discover", "Diagnose", "Design", "Deliver", "Evolve"];

/**
 * Full-screen count-up intro modelled on weevolveit.com: a 000→100% counter
 * with the five phase labels lighting up, then it fades away and releases the
 * page. Skipped entirely for prefers-reduced-motion.
 */
export default function Preloader() {
  const [pct, setPct] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDone(true);
      return;
    }
    const html = document.documentElement;
    html.style.overflow = "hidden";

    const start = performance.now();
    const dur = 1900;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setPct(Math.round(eased * 100));
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        html.style.overflow = "";
        setTimeout(() => setDone(true), 450);
      }
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      html.style.overflow = "";
    };
  }, []);

  if (done) return null;
  const active = Math.min(PHASES.length - 1, Math.floor((pct / 100) * PHASES.length));

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#030307] transition-opacity duration-500 ${
        pct >= 100 ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      <div className="text-7xl font-extrabold tabular-nums tracking-tight text-white sm:text-8xl">
        {String(pct).padStart(3, "0")}
        <span className="text-indigo-400">%</span>
      </div>
      <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 font-mono text-[10px] uppercase tracking-[0.25em]">
        {PHASES.map((p, i) => (
          <span key={p} className="flex items-center gap-2">
            <span className={`h-1.5 w-1.5 rounded-full transition-colors ${i <= active ? "bg-indigo-400" : "bg-zinc-700"}`} />
            <span className={i <= active ? "text-zinc-200" : "text-zinc-600"}>{p}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
