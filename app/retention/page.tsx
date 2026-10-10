"use client";

import DashboardLayout from "@/components/navigation/DashboardLayout";
import { CalendarDays, Filter, Download } from "lucide-react";
import { mockRetentionCohorts } from "@/lib/mock-analytics-data";

export default function RetentionPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Retention</h1>
            <p className="text-sm text-zinc-400">Measure how many users return after performing an event.</p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3 p-4 bg-zinc-900/50 rounded-xl border border-zinc-800">
          <div className="flex-1 flex gap-2">
            <select className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-300 font-medium">
              <option>Retention type</option>
              <option>N-Day Retention</option>
              <option>Unbounded Retention</option>
            </select>
            <select className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-300 font-medium">
              <option>Daily</option>
              <option>Weekly</option>
              <option>Monthly</option>
            </select>
            <button className="flex items-center gap-1.5 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-300 font-medium hover:text-white transition">
              <Filter size={14} /> Add filter
            </button>
          </div>
        </div>

        {/* Chart Area */}
        <div className="glow-card rounded-xl p-6 border border-zinc-800 bg-zinc-950/50 overflow-hidden">
          <div className="mb-4">
             <h3 className="text-sm font-bold text-white">Cohort Retention Heatmap</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-separate border-spacing-y-1">
              <thead>
                <tr>
                  <th className="px-3 py-2 text-xs text-zinc-500 font-semibold w-32">Cohort</th>
                  <th className="px-3 py-2 text-xs text-zinc-500 font-semibold w-24">Users</th>
                  {[0, 1, 7, 14, 21, 28, 30].map(day => (
                    <th key={day} className="px-3 py-2 text-xs text-zinc-500 font-semibold text-center">Day {day}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mockRetentionCohorts.map((cohort, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 text-xs font-medium text-white bg-zinc-900/50 rounded-l-lg">{cohort.date}</td>
                    <td className="px-3 py-2 text-xs text-zinc-400 bg-zinc-900/50">{cohort.users.toLocaleString()}</td>
                    {cohort.days.map((val, j) => (
                      <td key={j} className="px-1 py-1">
                        <div 
                          className="h-8 flex items-center justify-center text-xs font-semibold text-white rounded"
                          style={{ backgroundColor: `rgba(99, 102, 241, ${val / 100})` }}
                        >
                          {val}%
                        </div>
                      </td>
                    ))}
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
