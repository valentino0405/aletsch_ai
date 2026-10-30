"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

const PHASES = [
  {
    n: "01",
    title: "Discover",
    lead: "80% of tech projects fail because no one asked the right question.",
    points: [
      "we don't start at the solution — we start at the uncomfortable truth",
      "how your business actually runs, not the org-chart version",
      "clarity before code",
    ],
  },
  {
    n: "02",
    title: "Diagnose",
    lead: "You can't fix what you can't see.",
    points: [
      "map the real workflows and where they break",
      "measure the cost of every friction",
      "evidence over opinion",
    ],
  },
  {
    n: "03",
    title: "Design",
    lead: "Blueprints, not buzzwords.",
    points: [
      "architect the system around how you actually operate",
      "design for adoption, not applause",
      "every decision reversible on purpose",
    ],
  },
  {
    n: "04",
    title: "Deliver",
    lead: "Shipped is not the same as adopted.",
    points: [
      "integrate into the way your team already works",
      "handover with training, not a zip file",
      "momentum from day one",
    ],
  },
  {
    n: "05",
    title: "Evolve",
    lead: "What doesn't evolve is already dying.",
    points: [
      "while most invoice and disappear, we stay",
      "your business changes every quarter — your tech has to match",
      "partnership, not project",
    ],
  },
];

/**
 * Scroll-pinned phase walkthrough (weevolveit.com "method" section). The outer
 * section is tall; the inner panel sticks to the viewport while a ScrollTrigger
 * maps scroll progress to the active phase. Giant watermark numeral behind.
 */
export default function PhaseScroller() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const st = ScrollTrigger.create({
      trigger: wrapRef.current,
      start: "top top",
      end: "bottom bottom",
      onUpdate: (self) => {
        const i = Math.min(PHASES.length - 1, Math.floor(self.progress * PHASES.length));
        setActive(i);
      },
    });
    return () => st.kill();
  }, []);

  const phase = PHASES[active];

  return (
    <section ref={wrapRef} style={{ height: `${PHASES.length * 100}vh` }} className="relative bg-[#030307]">
      <div className="sticky top-0 flex h-screen items-center overflow-hidden">
        <span className="pointer-events-none absolute -right-4 top-1/2 -translate-y-1/2 select-none text-[42vw] font-extrabold leading-none text-white/[0.04] sm:text-[34vw]">
          {phase.n}
        </span>

        <div className="relative z-10 mx-auto w-full max-w-7xl px-6 lg:px-8">
          <div key={active} className="phase-in ml-auto max-w-xl">
            <span className="font-mono text-xs uppercase tracking-[0.3em] text-indigo-400">
              Phase {phase.n}
            </span>
            <h3 className="mt-4 text-6xl font-extrabold leading-none tracking-tight text-white sm:text-7xl">
              {phase.title}
            </h3>
            <p className="mt-6 text-xl font-medium leading-snug text-zinc-200">{phase.lead}</p>
            <ul className="mt-6 space-y-2.5">
              {phase.points.map((p) => (
                <li key={p} className="flex gap-3 text-sm leading-relaxed text-zinc-400">
                  <span className="mt-2 h-px w-5 shrink-0 bg-indigo-500/70" />
                  {p}
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-14 flex items-center justify-center gap-2 font-mono text-[10px] uppercase tracking-[0.25em]">
            {PHASES.map((p, i) => (
              <div key={p.n} className="flex items-center gap-2">
                <span className={i <= active ? "text-white" : "text-zinc-600"}>{p.title}</span>
                {i < PHASES.length - 1 && <span className="h-px w-6 bg-zinc-700 sm:w-10" />}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
