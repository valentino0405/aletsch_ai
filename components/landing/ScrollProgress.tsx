"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Right-rail scroll indicator inspired by the reference sites' "000%" marker.
 * Pure scroll listener, rAF-throttled, passive. No dependency.
 */
export default function ScrollProgress() {
  const [percent, setPercent] = useState(0);
  const ticking = useRef(false);

  useEffect(() => {
    const update = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight;
      const pct = max > 0 ? Math.min(100, Math.round((doc.scrollTop / max) * 100)) : 0;
      setPercent(pct);
      ticking.current = false;
    };

    const onScroll = () => {
      if (!ticking.current) {
        ticking.current = true;
        requestAnimationFrame(update);
      }
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed right-5 top-1/2 z-30 hidden -translate-y-1/2 flex-col items-center gap-3 lg:flex"
    >
      <div className="relative h-28 w-px bg-zinc-700/50">
        <div
          className="absolute left-0 top-0 w-px bg-gradient-to-b from-indigo-400 to-purple-500"
          style={{ height: `${percent}%` }}
        />
      </div>
      <span className="font-mono text-[10px] tabular-nums tracking-widest text-zinc-500">
        {String(percent).padStart(3, "0")}%
      </span>
    </div>
  );
}
