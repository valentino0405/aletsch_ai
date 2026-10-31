"use client";

import Link from "next/link";
import DashboardLayout from "@/components/navigation/DashboardLayout";
import { ArrowUpRight, Braces, Database, LockKeyhole } from "lucide-react";

export default function SqlPage() {
  return <DashboardLayout><div className="space-y-7">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-300/80">Explore data</p><h1 className="mt-2 flex items-center gap-3 text-3xl font-semibold tracking-tight text-white">SQL <span className="rounded-full border border-white/[0.09] bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Preview</span></h1><p className="mt-2 text-sm text-zinc-400">A direct query workspace for your captured event data.</p></div></header>
    <section className="glow-card glass-surface rounded-2xl p-6 sm:p-8">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-400/10 text-indigo-300"><Braces size={20} /></div>
      <h2 className="mt-5 text-lg font-semibold text-white">Query execution is not available yet</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">This workspace is reserved for querying your captured events. Aletsch does not currently execute SQL, so it won’t display sample result rows as if they came from your project.</p>
      <div className="mt-7 rounded-xl border border-white/[0.07] bg-black/20 p-4 font-mono text-xs leading-6 sm:p-5"><p className="mb-2 flex items-center gap-2 font-sans text-[11px] font-medium uppercase tracking-wider text-zinc-500"><Database size={13} /> Example only · not executed</p><p><span className="text-violet-300">SELECT</span> event_name, <span className="text-cyan-300">COUNT</span>(*) <span className="text-violet-300">AS</span> occurrences</p><p><span className="text-violet-300">FROM</span> events</p><p><span className="text-violet-300">GROUP BY</span> event_name</p><p><span className="text-violet-300">ORDER BY</span> occurrences <span className="text-violet-300">DESC</span></p></div>
      <div className="mt-6 flex flex-wrap items-center gap-3"><span className="inline-flex items-center gap-2 rounded-lg border border-white/[0.07] px-3 py-2 text-xs text-zinc-500"><LockKeyhole size={14} /> Execution is disabled</span><Link href="/events" className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-indigo-400">Browse real event data <ArrowUpRight size={14} /></Link></div>
    </section>
  </div></DashboardLayout>;
}
