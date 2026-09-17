"use client";

import DashboardLayout from "@/components/navigation/DashboardLayout";
import { Database, Play } from "lucide-react";
import { mockSqlResults } from "@/lib/mock-analytics-data";

export default function SqlPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6 flex flex-col h-[calc(100vh-80px)]">
        <div className="flex items-center justify-between shrink-0">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              SQL <span className="text-[10px] bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded-full uppercase tracking-wider">Beta</span>
            </h1>
            <p className="text-sm text-zinc-400">Query your event data directly using SQL.</p>
          </div>
          <button className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-semibold transition">
            <Play size={16} /> Run Query
          </button>
        </div>

        <div className="flex-1 flex flex-col gap-4 min-h-0">
          {/* Editor */}
          <div className="h-48 shrink-0 bg-[#0d0d12] border border-zinc-800 rounded-xl p-4 font-mono text-sm overflow-auto">
            <div className="text-zinc-500 mb-2">-- Example Query (UI Mock)</div>
            <div className="text-indigo-400">SELECT</div>
            <div className="text-white pl-4">event_name,</div>
            <div className="text-white pl-4"><span className="text-cyan-400">COUNT</span>(*) <span className="text-indigo-400">as</span> count</div>
            <div className="text-indigo-400">FROM</div>
            <div className="text-white pl-4">events</div>
            <div className="text-indigo-400">GROUP BY</div>
            <div className="text-white pl-4">event_name</div>
            <div className="text-indigo-400">ORDER BY</div>
            <div className="text-white pl-4">count <span className="text-indigo-400">DESC</span></div>
            <div className="text-indigo-400">LIMIT</div>
            <div className="text-amber-400 pl-4">5</div>
          </div>

          {/* Results */}
          <div className="flex-1 glow-card rounded-xl border border-zinc-800 bg-zinc-950/50 overflow-hidden flex flex-col min-h-0">
            <div className="p-3 border-b border-zinc-800 shrink-0 flex items-center gap-2 text-xs font-semibold text-zinc-400">
              <Database size={14} /> Query Results
            </div>
            <div className="overflow-auto flex-1">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-zinc-900/50 text-xs text-zinc-500 font-semibold sticky top-0">
                  <tr>
                    {mockSqlResults.columns.map((col, i) => (
                      <th key={i} className="px-4 py-3 border-b border-zinc-800">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {mockSqlResults.rows.map((row, i) => (
                    <tr key={i} className="hover:bg-zinc-900/30">
                      {row.map((cell, j) => (
                        <td key={j} className="px-4 py-2 text-zinc-300 font-mono text-xs">{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
