"use client";

import { useState } from "react";
import DashboardLayout from "@/components/navigation/DashboardLayout";
import { Activity, Search, Filter, RefreshCw, ChevronDown } from "lucide-react";

export default function Events() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");

  const eventsData = [
    { name: "page_view", category: "Pageview", users: "8,642", occurrences: "12,653", lastSeen: "2m ago" },
    { name: "button_click", category: "Interaction", users: "5,910", occurrences: "7,842", lastSeen: "5m ago" },
    { name: "form_submit", category: "Form", users: "4,552", occurrences: "4,312", lastSeen: "12m ago" },
    { name: "sign_up", category: "Conversion", users: "5,910", occurrences: "5,910", lastSeen: "15m ago" },
    { name: "login", category: "Conversion", users: "4,552", occurrences: "4,552", lastSeen: "32m ago" },
    { name: "repository_connected", category: "Conversion", users: "2,184", occurrences: "2,184", lastSeen: "1h ago" },
    { name: "analysis_started", category: "System", users: "2,143", occurrences: "3,110", lastSeen: "2h ago" },
    { name: "analysis_completed", category: "System", users: "2,143", occurrences: "3,090", lastSeen: "2h ago" },
  ];

  const filteredEvents = eventsData.filter((ev) => {
    const matchesSearch = ev.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCat = selectedCategory === "All" || ev.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Events Explorer</h1>
            <p className="text-sm text-zinc-400">
              Query and view all auto-instrumented events captured in your application.
            </p>
          </div>
          <button className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white transition cursor-pointer">
            <RefreshCw size={14} />
          </button>
        </div>

        {/* Filters bar */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={14} />
            <input
              type="text"
              placeholder="Search events..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-zinc-950/40 border border-zinc-800 focus:border-indigo-500 rounded-lg pl-9 pr-4 py-2 text-xs text-zinc-200 placeholder-zinc-600 outline-none transition"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter size={14} className="text-zinc-500" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
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

        {/* Events Table */}
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
                {filteredEvents.map((ev) => (
                  <tr key={ev.name} className="hover:bg-zinc-950/30 transition">
                    <td className="py-4 px-6 font-mono text-indigo-400 font-semibold">{ev.name}</td>
                    <td className="py-4 px-4">
                      <span className="bg-zinc-900 text-zinc-300 text-[10px] font-mono px-2 py-0.5 rounded border border-zinc-800">
                        {ev.category}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-right font-semibold text-white">{ev.users}</td>
                    <td className="py-4 px-4 text-right font-semibold text-white">{ev.occurrences}</td>
                    <td className="py-4 px-6 text-right text-zinc-500">{ev.lastSeen}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
