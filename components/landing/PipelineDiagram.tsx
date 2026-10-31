"use client";

import { useEffect, useRef, useState } from "react";
import { GitBranch, Code2, Cpu, Database, BarChart3, ArrowRight } from "lucide-react";

const STAGES = [
  { num: "01", title: "Connect", tag: "GITHUB · OAUTH", Icon: GitBranch, desc: "Link a repository read-only. Nothing runs inside your infrastructure." },
  { num: "02", title: "Understand", tag: "AST · TS-MORPH", Icon: Code2, desc: "Parse the component tree to map routes, forms, and click targets." },
  { num: "03", title: "Instrument", tag: "AUTO HOOKS", Icon: Cpu, desc: "Generate event tracking automatically — no manual tagging." },
  { num: "04", title: "Ingest", tag: "WRITE KEY", Icon: Database, desc: "Events stream through a per-project key. PII is stripped at the edge." },
  { num: "05", title: "Analyze", tag: "FUNNELS · AI", Icon: BarChart3, desc: "Funnels, retention, paths and insights — from real counted events." },
];

/**
 * Interactive "pipeline" diagram modelled on daqconsulting.com's data-platform
 * graphic: a numbered step list drives a horizontal node flow. Hovering a step
 * or node lights it up and advances the flow. Auto-cycles until interacted with;
 * stays static for prefers-reduced-motion. Pure state + CSS, no dependency.
 */
export default function PipelineDiagram() {
  const [active, setActive] = useState(0);
  const paused = useRef(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => {
      if (!paused.current) setActive((a) => (a + 1) % STAGES.length);
    }, 2600);
    return () => clearInterval(id);
  }, []);

  const hold = (i: number) => {
    paused.current = true;
    setActive(i);
  };
  const release = () => {
    paused.current = false;
  };

  return (
    <div className="grid gap-10 lg:grid-cols-[250px_1fr] lg:gap-14" onMouseLeave={release}>
      {/* Numbered steps */}
      <div className="flex flex-col gap-5">
        {STAGES.map((s, i) => (
          <button
            key={s.num}
            type="button"
            onMouseEnter={() => hold(i)}
            onFocus={() => hold(i)}
            onClick={() => hold(i)}
            className="group text-left"
          >
            <div className="flex items-baseline gap-3">
              <span className={`font-mono text-xs ${active === i ? "text-indigo-400" : "text-zinc-600"}`}>
                {s.num}
              </span>
              <span
                className={`text-lg font-semibold transition-colors ${
                  active === i ? "text-white" : "text-zinc-500 group-hover:text-zinc-300"
                }`}
              >
                {s.title}
              </span>
            </div>
            <div
              className={`grid pl-8 transition-all duration-300 ${
                active === i ? "mt-1 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
              }`}
            >
              <p className="overflow-hidden text-sm leading-relaxed text-zinc-400">{s.desc}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Node flow */}
      <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
        {STAGES.map((s, i) => {
          const isActive = i === active;
          const reached = i <= active;
          return (
            <div key={s.num} className="contents">
              <div
                onMouseEnter={() => hold(i)}
                className={`w-full rounded-xl border p-4 transition-all duration-300 sm:flex-1 ${
                  isActive
                    ? "border-indigo-500/60 bg-indigo-500/10 shadow-[0_0_30px_rgba(255,96,70,0.15)]"
                    : reached
                    ? "border-zinc-700/60 bg-zinc-900/40"
                    : "border-zinc-800/60 bg-zinc-950/40"
                }`}
              >
                <s.Icon size={18} className={isActive ? "text-indigo-300" : reached ? "text-zinc-300" : "text-zinc-600"} />
                <div className="mt-3 text-sm font-semibold text-white">{s.title}</div>
                <div
                  className={`mt-1 font-mono text-[9px] uppercase tracking-widest ${
                    isActive ? "text-indigo-300/80" : "text-zinc-500"
                  }`}
                >
                  {s.tag}
                </div>
              </div>
              {i < STAGES.length - 1 && (
                <ArrowRight
                  size={16}
                  className={`mx-auto shrink-0 rotate-90 transition-colors sm:mx-0 sm:rotate-0 ${
                    i < active ? "text-indigo-400" : "text-zinc-700"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
