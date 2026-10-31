"use client";

import Link from "next/link";
import DashboardLayout from "@/components/navigation/DashboardLayout";
import { Activity, ArrowUpRight, RefreshCcw } from "lucide-react";

export default function LifecyclePage() {
  return <DashboardLayout><div className="space-y-7">
    <header><p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-300/80">Engagement</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">Lifecycle</h1><p className="mt-2 text-sm text-zinc-400">Understand when users are new, returning, or re-engaging.</p></header>
    <section className="glow-card glass-surface rounded-2xl px-6 py-16 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04] text-indigo-300"><RefreshCcw size={20} /></div>
      <h2 className="mt-5 text-lg font-semibold text-white">Lifecycle stages are not measured yet</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-zinc-400">Classifying new, returning, and resurrected users requires comparing each user’s activity across defined time windows. This project currently exposes session totals, but not those lifecycle windows.</p>
      <div className="mx-auto mt-7 grid max-w-2xl gap-3 text-left sm:grid-cols-3">{[{ title: "New", detail: "First activity in the selected period" }, { title: "Returning", detail: "Active now and in an earlier period" }, { title: "Resurrected", detail: "Active now after a quiet period" }].map((item) => <div key={item.title} className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-4"><p className="text-sm font-semibold text-zinc-200">{item.title}</p><p className="mt-1 text-xs leading-5 text-zinc-500">{item.detail}</p></div>)}</div>
      <div className="mt-6"><Link href="/events" className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-4 py-2.5 text-xs font-semibold text-zinc-300 transition hover:bg-white/5">Inspect event activity <ArrowUpRight size={14} /></Link></div>
    </section>
    <p className="flex items-center gap-2 text-xs text-zinc-600"><Activity size={13} /> No placeholder counts are used on this page.</p>
  </div></DashboardLayout>;
}
