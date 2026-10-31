"use client";

import Link from "next/link";
import DashboardLayout from "@/components/navigation/DashboardLayout";
import { ArrowUpRight, CalendarDays, Repeat2 } from "lucide-react";

export default function RetentionPage() {
  return <DashboardLayout><div className="space-y-7">
    <header><p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-300/80">Engagement</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">Retention</h1><p className="mt-2 text-sm text-zinc-400">Measure whether users return after their first meaningful event.</p></header>
    <section className="glow-card glass-surface rounded-2xl px-6 py-16 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04] text-indigo-300"><Repeat2 size={21} /></div>
      <h2 className="mt-5 text-lg font-semibold text-white">Retention cohorts need dated return activity</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-zinc-400">A real cohort chart needs a first-seen date and subsequent activity for each user. The current event summary does not yet expose those cohort calculations, so there is no measured heatmap to show.</p>
      <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs text-zinc-400"><CalendarDays size={14} /> No sample percentages shown</div>
      <div className="mt-6"><Link href="/events" className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-indigo-400">Review captured events <ArrowUpRight size={14} /></Link></div>
    </section>
    <p className="text-xs text-zinc-600">Retention measurement will appear when user identity and event timestamps can be grouped into cohorts.</p>
  </div></DashboardLayout>;
}
