"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/navigation/DashboardLayout";
import { ArrowUpRight, Magnet, Users } from "lucide-react";

type UserRow = { sessions?: number };

export default function StickinessPage() {
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/users").then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load user activity.");
      return data as UserRow[];
    }).then(setUsers).catch((cause) => setError(cause.message));
  }, []);

  const total = users?.length ?? 0;
  const returning = users?.filter((user) => (user.sessions ?? 0) > 1).length ?? 0;
  const singleSession = total - returning;
  const ratio = total ? Math.round(returning / total * 100) : 0;
  const distribution = [{ label: "One session", count: singleSession }, { label: "2+ sessions", count: returning }];

  return <DashboardLayout><div className="space-y-7">
    <header><p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-300/80">Engagement</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">Stickiness</h1><p className="mt-2 text-sm text-zinc-400">A simple view of repeat sessions across users with recorded activity.</p></header>
    {error && <div className="glass-surface rounded-2xl p-4 text-sm text-rose-300">{error}</div>}
    <section className="grid gap-4 sm:grid-cols-3">
      {[
        { label: "Users with activity", value: users ? total.toLocaleString() : "—", note: "Users present in the activity data" },
        { label: "Users with repeat sessions", value: users ? returning.toLocaleString() : "—", note: "Two or more recorded sessions" },
        { label: "Repeat-session share", value: users && total ? `${ratio}%` : "—", note: "Repeat-session users ÷ users with activity" },
      ].map((metric) => <article key={metric.label} className="glow-card glass-surface rounded-2xl p-5"><p className="text-sm text-zinc-400">{metric.label}</p><p className="mt-5 text-3xl font-semibold tracking-tight text-white">{metric.value}</p><p className="mt-2 text-xs text-zinc-500">{metric.note}</p></article>)}
    </section>
    <section className="glow-card glass-surface rounded-2xl p-6">
      <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-400/10 text-indigo-300"><Magnet size={19} /></div><div><h2 className="font-semibold text-white">Session frequency</h2><p className="mt-1 text-xs text-zinc-500">Based on available user session totals</p></div></div>
      {users && total > 0 ? <div className="mt-7 space-y-5">{distribution.map((item) => <div key={item.label} className="grid grid-cols-[100px_1fr_80px] items-center gap-4"><span className="text-xs text-zinc-400">{item.label}</span><div className="h-2 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-violet-400 transition-[width] duration-700" style={{ width: `${item.count / total * 100}%` }} /></div><span className="text-right font-mono text-xs text-zinc-300">{item.count.toLocaleString()}</span></div>)}</div> : <div className="py-12 text-center"><Users className="mx-auto text-zinc-600" size={22} /><h3 className="mt-3 text-sm font-semibold text-white">No user activity to summarize</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-400">Connect a project and collect events to see session frequency. Time-windowed DAU and MAU require dated user activity, which this summary endpoint does not provide yet.</p><Link href="/instrumentation" className="mt-5 inline-flex items-center gap-1 text-xs font-semibold text-indigo-300 hover:text-indigo-200">Set up instrumentation <ArrowUpRight size={14} /></Link></div>}
    </section>
    <p className="text-xs text-zinc-600">Session counts are all-time totals from the available user summary; this view does not imply a daily or monthly active-user count.</p>
  </div></DashboardLayout>;
}
