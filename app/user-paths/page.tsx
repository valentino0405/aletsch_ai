"use client";

import Link from "next/link";
import DashboardLayout from "@/components/navigation/DashboardLayout";
import { ArrowUpRight, GitBranch, Route } from "lucide-react";

export default function UserPathsPage() {
  return <DashboardLayout><div className="space-y-7">
    <header><p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-300/80">Journeys</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">User paths</h1><p className="mt-2 text-sm text-zinc-400">Explore the real route and event sequences people take through your product.</p></header>
    <section className="glow-card glass-surface rounded-2xl px-6 py-16 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04] text-indigo-300"><Route size={20} /></div>
      <h2 className="mt-5 text-lg font-semibold text-white">Path sequences are not aggregated yet</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-zinc-400">A useful path report groups timestamped events by session, orders each journey, then counts the common transitions. Aletsch has event-level data, but this page does not yet calculate those session sequences.</p>
      <div className="mx-auto mt-7 flex max-w-md items-center justify-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.025] p-4 text-xs text-zinc-500"><span className="rounded-md bg-white/[0.05] px-2 py-1 text-zinc-300">Route</span><GitBranch size={15} /><span className="rounded-md bg-white/[0.05] px-2 py-1 text-zinc-300">Next event</span><GitBranch size={15} /><span className="rounded-md bg-white/[0.05] px-2 py-1 text-zinc-300">Outcome</span></div>
      <div className="mt-6"><Link href="/events" className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-indigo-400">Review captured events <ArrowUpRight size={14} /></Link></div>
    </section>
  </div></DashboardLayout>;
}
