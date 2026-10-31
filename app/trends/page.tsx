"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/navigation/DashboardLayout";
import { Activity, ArrowUpRight, CalendarRange, Radio, Users } from "lucide-react";

type EventRow = { eventName: string; label?: string; count: number; users: number; lastSeen?: string | null };
type Catalog = { events?: EventRow[]; error?: string; unavailable?: { reason?: string } };

const ranges = [
  { value: "24h", label: "24 hours" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
];

export default function TrendsPage() {
  const [range, setRange] = useState("30d");
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/analytics/events?dateRange=${range}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load event activity.");
        return data as Catalog;
      })
      .then((data) => { if (!cancelled) setCatalog(data); })
      .catch((error) => { if (!cancelled) setCatalog({ error: error.message }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [range]);

  const events = catalog?.events ?? [];
  const occurrences = events.reduce((sum, event) => sum + event.count, 0);
  const activeTypes = events.filter((event) => event.count > 0).length;
  const peak = Math.max(...events.map((event) => event.count), 1);

  return (
    <DashboardLayout>
      <div className="space-y-7">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-300/80">Product analytics</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">Event trends</h1>
            <p className="mt-2 text-sm text-zinc-400">See which events are actually being emitted by your product.</p>
          </div>
          <label className="glass-toolbar flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-zinc-300">
            <CalendarRange size={15} className="text-zinc-400" />
            <span className="sr-only">Time range</span>
            <select value={range} onChange={(event) => setRange(event.target.value)} className="bg-transparent outline-none">
              {ranges.map((item) => <option className="bg-zinc-950" key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
        </header>

        {catalog?.error && <div className="glass-surface rounded-2xl p-4 text-sm text-rose-300">{catalog.error}</div>}

        <section className="grid gap-4 sm:grid-cols-3">
          {[
            { label: "Active event types", value: loading ? "—" : activeTypes.toLocaleString(), icon: Radio, hint: `Events seen in the last ${ranges.find((item) => item.value === range)?.label}` },
            { label: "Occurrences", value: loading ? "—" : occurrences.toLocaleString(), icon: Activity, hint: "Across listed event types" },
            { label: "Avg. per event", value: loading || !activeTypes ? "—" : Math.round(occurrences / activeTypes).toLocaleString(), icon: Users, hint: "Occurrences divided by active types" },
          ].map(({ label, value, icon: Icon, hint }) => (
            <article key={label} className="glow-card glass-surface rounded-2xl p-5">
              <div className="flex items-center justify-between text-sm text-zinc-400"><span>{label}</span><Icon size={17} className="text-indigo-300" /></div>
              <div className="mt-5 text-3xl font-semibold tracking-tight text-white">{value}</div>
              <p className="mt-2 text-xs text-zinc-500">{hint}</p>
            </article>
          ))}
        </section>

        <section className="glow-card glass-surface overflow-hidden rounded-2xl">
          <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
            <div><h2 className="font-semibold text-white">Most active events</h2><p className="mt-1 text-xs text-zinc-500">Ranked by observed occurrences · {ranges.find((item) => item.value === range)?.label}</p></div>
            <Link href="/events" className="flex items-center gap-1 text-xs font-medium text-indigo-300 hover:text-indigo-200">Event catalog <ArrowUpRight size={14} /></Link>
          </div>
          {loading ? <div className="space-y-3 p-5">{[1, 2, 3, 4].map((key) => <div key={key} className="h-10 animate-pulse rounded-lg bg-white/[0.04]" />)}</div> : events.length ? (
            <div className="divide-y divide-white/[0.05]">
              {events.slice(0, 12).map((event) => (
                <div key={event.eventName} className="grid grid-cols-[minmax(0,1fr)_90px_90px] items-center gap-4 px-5 py-3.5 transition hover:bg-white/[0.025] sm:grid-cols-[minmax(180px,1.2fr)_minmax(100px,2fr)_100px_110px]">
                  <div className="min-w-0"><p className="truncate text-sm font-medium text-zinc-200">{event.label || event.eventName}</p><p className="truncate font-mono text-[11px] text-zinc-500">{event.eventName}</p></div>
                  <div className="hidden h-1.5 overflow-hidden rounded-full bg-white/[0.06] sm:block"><div className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-violet-400" style={{ width: `${Math.max(3, event.count / peak * 100)}%` }} /></div>
                  <span className="text-right font-mono text-xs text-zinc-300">{event.count.toLocaleString()} <span className="text-zinc-500 sm:hidden">occ.</span></span>
                  <span className="hidden text-right text-xs text-zinc-400 sm:block">{event.users.toLocaleString()} users</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-6 py-14 text-center">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04] text-indigo-300"><Activity size={19} /></div>
              <h3 className="mt-4 text-sm font-semibold text-white">No event activity in this range</h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-400">Once your project sends events, their real counts and active users will show here. Start by instrumenting a repository or inspecting the event catalog.</p>
              <div className="mt-5 flex justify-center gap-3"><Link href="/instrumentation" className="rounded-lg bg-indigo-500 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-indigo-400">Instrument repository</Link><Link href="/events" className="rounded-lg border border-white/10 px-3.5 py-2 text-xs font-semibold text-zinc-300 transition hover:bg-white/5">Open events</Link></div>
              {catalog?.unavailable?.reason && <p className="mt-4 text-xs text-zinc-600">{catalog.unavailable.reason}</p>}
            </div>
          )}
        </section>
        <p className="text-xs text-zinc-600">The event catalog returns up to 150 event types. Counts reflect the selected project scope and time range.</p>
      </div>
    </DashboardLayout>
  );
}
