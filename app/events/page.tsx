"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import DashboardLayout from "@/components/navigation/DashboardLayout";
import { Search, Filter, RefreshCw, Loader2, XCircle } from "lucide-react";

interface EventRow {
  name: string;
  category: string;
  users: number | string;
  occurrences: number | string;
  lastSeen: string;
}

function EventsExplorer() {
  const searchParams = useSearchParams();
  // Seeded from the URL so the Topbar's ⌘K search lands on a filtered view.
  const [searchTerm, setSearchTerm] = useState(searchParams.get("search") || "");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (selectedCategory !== "All") params.set("category", selectedCategory);
      // Encoded: an unescaped term used to break the query string.
      if (searchTerm.trim()) params.set("search", searchTerm.trim());

      const response = await fetch(`/api/events?${params.toString()}`);
      const data = await response.json().catch(() => []);
      if (!response.ok) {
        setError(data.error || "Events could not be loaded.");
        setEvents([]);
        return;
      }
      setEvents(Array.isArray(data) ? data : []);
    } catch {
      setError("Network error while loading events.");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, searchTerm]);

  useEffect(() => {
    const timer = window.setTimeout(loadEvents, searchTerm ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [loadEvents, searchTerm]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Events Explorer</h1>
          <p className="text-sm text-zinc-400">
            Every event your instrumented application has sent to Aletsch.
          </p>
        </div>
        <button
          onClick={loadEvents}
          disabled={loading}
          className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white transition cursor-pointer disabled:opacity-50"
          aria-label="Refresh events"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={14} />
          <input
            type="text"
            placeholder="Search events..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="w-full bg-zinc-950/40 border border-zinc-800 focus:border-indigo-500 rounded-lg pl-9 pr-4 py-2 text-xs text-zinc-200 placeholder-zinc-600 outline-none transition"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter size={14} className="text-zinc-500" />
          <select
            value={selectedCategory}
            onChange={(event) => setSelectedCategory(event.target.value)}
            className="bg-zinc-950/80 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-300 font-semibold outline-none cursor-pointer"
          >
            <option>All</option>
            <option>Pageview</option>
            <option>Interaction</option>
            <option>Form</option>
            <option>Conversion</option>
            <option>System</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
          <XCircle size={13} className="shrink-0" />
          {error}
        </div>
      )}

      {/* Table */}
      <div className="glow-card rounded-xl overflow-hidden glow-indigo">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-900 bg-zinc-950/40 text-[10px] uppercase font-bold text-zinc-500 tracking-wider">
                <th className="py-4 px-6">Event Name</th>
                <th className="py-4 px-4">Category</th>
                <th className="py-4 px-4 text-right">Unique Users</th>
                <th className="py-4 px-4 text-right">Occurrences</th>
                <th className="py-4 px-6 text-right">Last Seen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900 text-xs">
              {loading && events.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-zinc-500">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 size={14} className="animate-spin" /> Loading events...
                    </span>
                  </td>
                </tr>
              ) : events.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-zinc-500">
                    {searchTerm || selectedCategory !== "All" ? (
                      <>No event matches this filter.</>
                    ) : (
                      <>
                        No events received yet. Connect a repository, apply instrumentation, and events will
                        appear here as your application is used.
                      </>
                    )}
                  </td>
                </tr>
              ) : (
                events.map((event) => (
                  <tr key={event.name} className="hover:bg-zinc-950/30 transition">
                    <td className="py-4 px-6 font-mono text-indigo-400 font-semibold">{event.name}</td>
                    <td className="py-4 px-4">
                      <span className="bg-zinc-900 text-zinc-300 text-[10px] font-mono px-2 py-0.5 rounded border border-zinc-800">
                        {event.category}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-right font-semibold text-white">{event.users}</td>
                    <td className="py-4 px-4 text-right font-semibold text-white">{event.occurrences}</td>
                    <td className="py-4 px-6 text-right text-zinc-500">{event.lastSeen}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function Events() {
  return (
    <DashboardLayout>
      {/* useSearchParams needs a Suspense boundary to prerender. */}
      <Suspense
        fallback={
          <div className="flex items-center gap-2 py-16 text-sm text-zinc-500">
            <Loader2 size={16} className="animate-spin" /> Loading events...
          </div>
        }
      >
        <EventsExplorer />
      </Suspense>
    </DashboardLayout>
  );
}
