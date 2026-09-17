"use client";

import DashboardLayout from "@/components/navigation/DashboardLayout";
import { LineChart, BarChart3, PieChart, Info, Filter, Plus, Download } from "lucide-react";
import { mockTrendsData } from "@/lib/mock-analytics-data";

export default function TrendsPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Trends</h1>
            <p className="text-sm text-zinc-400">Analyze how your events and metrics are performing over time.</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition">
              Save Report
            </button>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3 p-4 bg-zinc-900/50 rounded-xl border border-zinc-800">
          <div className="flex-1 flex gap-2">
            <select className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-300 font-medium">
              <option>Line chart</option>
              <option>Bar chart</option>
            </select>
            <select className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-300 font-medium">
              <option>Last 30 days</option>
              <option>Last 7 days</option>
              <option>Today</option>
            </select>
            <button className="flex items-center gap-1.5 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-300 font-medium hover:text-white transition">
              <Filter size={14} /> Add filter
            </button>
          </div>
          <div className="flex gap-2">
            <select className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-300 font-medium">
              <option>Daily</option>
              <option>Weekly</option>
              <option>Monthly</option>
            </select>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="glow-card rounded-xl p-4 border border-zinc-800 bg-zinc-950/50">
            <h3 className="text-xs text-zinc-500 font-medium">Total Events</h3>
            <div className="text-2xl font-bold text-white mt-1">1,245,600</div>
            <div className="text-xs text-emerald-500 font-medium mt-1">+12.5% from last period</div>
          </div>
          <div className="glow-card rounded-xl p-4 border border-zinc-800 bg-zinc-950/50">
            <h3 className="text-xs text-zinc-500 font-medium">Unique Users</h3>
            <div className="text-2xl font-bold text-white mt-1">45,210</div>
            <div className="text-xs text-emerald-500 font-medium mt-1">+8.2% from last period</div>
          </div>
          <div className="glow-card rounded-xl p-4 border border-zinc-800 bg-zinc-950/50">
            <h3 className="text-xs text-zinc-500 font-medium">Avg per User</h3>
            <div className="text-2xl font-bold text-white mt-1">27.5</div>
            <div className="text-xs text-rose-500 font-medium mt-1">-2.1% from last period</div>
          </div>
          <div className="glow-card rounded-xl p-4 border border-zinc-800 bg-zinc-950/50">
            <h3 className="text-xs text-zinc-500 font-medium">Active Events</h3>
            <div className="text-2xl font-bold text-white mt-1">12</div>
            <div className="text-xs text-zinc-500 font-medium mt-1">No change</div>
          </div>
        </div>

        {/* Chart Area */}
        <div className="glow-card rounded-xl p-6 border border-zinc-800 bg-zinc-950/50 h-80 flex items-center justify-center relative overflow-hidden">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
          <div className="relative z-10 flex flex-col items-center gap-2">
            <LineChart size={48} className="text-zinc-700" />
            <p className="text-sm font-semibold text-zinc-400">Mock Data Visualization</p>
            <p className="text-xs text-zinc-500">Real-time charts will be implemented in the next phase.</p>
          </div>
        </div>

        {/* Data Table */}
        <div className="glow-card rounded-xl border border-zinc-800 bg-zinc-950/50 overflow-hidden">
          <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">Event Performance</h3>
            <button className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 hover:text-white transition">
              <Download size={14} /> Export
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-900/50 text-xs text-zinc-500 uppercase font-semibold">
                <tr>
                  <th className="px-4 py-3 font-medium">Event Name</th>
                  <th className="px-4 py-3 font-medium">Users</th>
                  <th className="px-4 py-3 font-medium">Occurrences</th>
                  <th className="px-4 py-3 font-medium">Trend</th>
                  <th className="px-4 py-3 font-medium">Change %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {mockTrendsData.map((row, i) => (
                  <tr key={i} className="hover:bg-zinc-900/30 transition">
                    <td className="px-4 py-3 font-medium text-white">{row.event}</td>
                    <td className="px-4 py-3 text-zinc-300">{row.users.toLocaleString()}</td>
                    <td className="px-4 py-3 text-zinc-300">{row.occurrences.toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${row.trend === 'up' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                        {row.trend === 'up' ? '↑' : '↓'}
                      </span>
                    </td>
                    <td className={`px-4 py-3 font-medium ${row.change > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {row.change > 0 ? '+' : ''}{row.change}%
                    </td>
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
