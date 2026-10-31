"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/navigation/DashboardLayout";
import { AlertTriangle, Database, RefreshCw, Filter, Users, LineChart, Clock } from "lucide-react";

interface FunnelStep {
  name: string;
  event: string;
  users: number;
  percent: number;
  drop: number;
  dropFromPrevious: number;
}

interface FunnelResponse {
  funnelName: string | null;
  source: "saved" | "derived-from-catalog" | "derived-from-events" | null;
  steps: FunnelStep[];
  conversionRate: number | null;
  largestDropoff: { from: string; to: string; rate: number } | null;
  atRiskCount: number;
  totalUsers: number;
  insufficientData: boolean;
  reason?: string;
  available?: string[];
}

export default function FunnelAnalysis() {
  const [selectedFunnel, setSelectedFunnel] = useState("");
  const [funnelData, setFunnelData] = useState<FunnelResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadFunnel = useCallback(async (name: string) => {
    setLoading(true);
    setError("");
    try {
      const query = name ? `?name=${encodeURIComponent(name)}` : "";
      const res = await fetch(`/api/funnels${query}`);
      const json = await res.json();

      if (!res.ok) {
        setError(json.error || "Could not load the funnel.");
        setFunnelData(null);
        return;
      }
      setFunnelData(json);
    } catch (err) {
      console.error("Failed to load conversion funnel details:", err);
      setError("Could not reach the funnel service.");
      setFunnelData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFunnel(selectedFunnel);
  }, [selectedFunnel, loadFunnel]);

  const steps = funnelData?.steps ?? [];
  const hasFunnel = steps.length > 0 && !funnelData?.insufficientData;
  const savedFunnels = funnelData?.available ?? [];

  return (
    <DashboardLayout>
      <div className="flex flex-col h-[calc(100vh-80px)]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 shrink-0">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
              <Filter className="text-indigo-500" size={28} />
              Funnel Analysis
            </h1>
            <p className="text-sm text-zinc-400 mt-1">
              Analyze user conversion flows, identify drop-offs, and understand what drives user completion.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={selectedFunnel}
              onChange={(e) => setSelectedFunnel(e.target.value)}
              className="bg-[#0d0d12] border border-zinc-800 rounded-lg px-4 py-2 text-sm text-zinc-300 font-semibold outline-none cursor-pointer"
            >
              <option value="">Auto-derived from events</option>
              {savedFunnels.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="glow-card rounded-xl p-4 mb-4 border border-rose-500/30 flex items-center gap-2 text-xs text-rose-400 font-semibold shrink-0">
            <AlertTriangle size={14} />
            {error}
          </div>
        )}

        <div className="flex gap-6 flex-1 min-h-0">
          {/* Left Panel: Funnel Definition */}
          <div className="w-80 flex flex-col gap-4 overflow-y-auto pr-2 shrink-0">
            <div className="glass-surface rounded-xl p-5">
              <h3 className="text-sm font-bold text-white mb-1">Measured funnel</h3>
              <p className="text-[11px] text-zinc-500 mb-5">Steps are derived from observed events or a saved funnel.</p>
              {hasFunnel ? <ol className="space-y-3">{steps.map((step, index) => <li key={`${step.event}-${index}`} className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.025] p-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-400/15 text-xs font-bold text-indigo-200">{index + 1}</span><span className="min-w-0"><span className="block truncate text-xs font-semibold text-zinc-200">{step.name}</span><span className="block truncate font-mono text-[10px] text-zinc-500">{step.event}</span></span></li>)}</ol> : <div className="rounded-lg border border-dashed border-white/10 px-4 py-8 text-center text-xs leading-5 text-zinc-500">Funnel stages will appear here when at least two real events are available.</div>}
            </div>
          </div>

          {/* Right Panel: Results Area */}
          <div className="flex-1 flex flex-col gap-6 overflow-y-auto pr-2 pb-10">
            
            {/* Top Toolbar */}
            <div className="glass-toolbar flex items-center justify-between rounded-xl p-3">
              <div className="flex items-center gap-2 text-xs text-zinc-400"><Filter size={14} className="text-indigo-300" /> Project event sequence</div>
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-zinc-500">{loading ? "Updating…" : "Live from captured events"}</span>
                <button
                  onClick={() => loadFunnel(selectedFunnel)}
                  disabled={loading}
                  className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-300 font-medium hover:text-white transition disabled:opacity-50"
                >
                  <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
                  Refresh
                </button>
              </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="glow-card rounded-xl p-4 border border-zinc-800 bg-[#0d0d12] flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                  <LineChart size={20} />
                </div>
                <div>
                  <h3 className="text-[11px] uppercase font-bold text-zinc-500 tracking-wider">Total Conversion</h3>
                  <div className="text-xl font-bold text-white mt-0.5">
                    {funnelData?.conversionRate !== null && funnelData?.conversionRate !== undefined ? `${funnelData.conversionRate}%` : "—"}
                  </div>
                </div>
              </div>
              <div className="glow-card rounded-xl p-4 border border-zinc-800 bg-[#0d0d12] flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400">
                  <Clock size={20} />
                </div>
                <div>
                  <h3 className="text-[11px] uppercase font-bold text-zinc-500 tracking-wider">Time to Convert</h3>
                  <div className="text-sm font-semibold text-zinc-400 mt-1">Not available</div>
                </div>
              </div>
              <div className="glow-card rounded-xl p-4 border border-zinc-800 bg-[#0d0d12] flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center text-cyan-400">
                  <Users size={20} />
                </div>
                <div>
                  <h3 className="text-[11px] uppercase font-bold text-zinc-500 tracking-wider">Unique Users</h3>
                  <div className="text-xl font-bold text-white mt-0.5">{funnelData?.totalUsers?.toLocaleString() ?? "—"}</div>
                </div>
              </div>
            </div>

            {/* Chart Area */}
            <div className="glow-card rounded-xl p-6 border border-zinc-800 bg-[#0d0d12] glow-indigo">
              {loading ? (
                <div className="space-y-6">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-10 bg-zinc-900/50 rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : hasFunnel ? (
                <div className="space-y-6">
                  {steps.map((step, index) => (
                    <div key={step.event} className="flex flex-col gap-2">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded-full bg-zinc-800 text-zinc-400 flex items-center justify-center text-[10px] font-bold">{index + 1}</div>
                          <span className="font-bold text-white">{step.name}</span>
                        </div>
                        {index > 0 && step.dropFromPrevious > 0 && (
                          <div className="text-rose-400 font-semibold flex items-center gap-1">
                            <AlertTriangle size={12} />
                            {step.users.toLocaleString()} users ({100 - step.dropFromPrevious}%) completed step
                          </div>
                        )}
                      </div>
                      <div className="h-10 bg-zinc-900/50 rounded-lg overflow-hidden border border-zinc-800/40 relative">
                        <div
                          className="h-full bg-indigo-600 hover:bg-indigo-500 transition-colors cursor-pointer"
                          style={{ width: `${Math.max(0, Math.min(100, step.percent))}%` }}
                        />
                        <div className="absolute inset-0 flex items-center justify-between px-3 pointer-events-none">
                          <span className="text-[11px] font-bold text-white drop-shadow-md">
                            {step.users.toLocaleString()} users ({step.percent}%)
                          </span>
                          <span className="text-[11px] font-bold text-white drop-shadow-md">{step.percent}%</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Database size={28} className="text-zinc-700 mb-3" />
                  <p className="text-sm font-bold text-zinc-400">Insufficient data to build a funnel</p>
                  <p className="text-xs text-zinc-500 mt-1 max-w-md">
                    {funnelData?.reason || "Instrument a repository and collect events, and the stages will be measured from them."}
                  </p>
                  <Link href="/instrumentation" className="mt-4 inline-flex items-center rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-zinc-300 transition hover:bg-white/5">Open instrumentation</Link>
                </div>
              )}
            </div>

            {/* Detailed Results Table */}
            <div className="glow-card rounded-xl border border-zinc-800 bg-[#0d0d12] overflow-hidden">
              <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
                <h3 className="text-sm font-bold text-white">Detailed Results</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-zinc-900/50 text-[10px] text-zinc-500 uppercase font-bold tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Step</th>
                      <th className="px-4 py-3">Users</th>
                      <th className="px-4 py-3">Conversion</th>
                      <th className="px-4 py-3">Drop-off</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50">
                    {hasFunnel ? (
                      steps.map((step, i) => (
                        <tr key={i} className="hover:bg-zinc-900/30 transition">
                          <td className="px-4 py-3 font-medium text-white flex items-center gap-2">
                            <div className="w-4 h-4 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-[9px] font-bold">{i + 1}</div>
                            <span><span className="block">{step.name}</span><span className="font-mono text-[10px] text-zinc-500">{step.event}</span></span>
                          </td>
                          <td className="px-4 py-3 text-zinc-300 font-mono text-xs">{step.users.toLocaleString()}</td>
                          <td className="px-4 py-3 text-zinc-300 text-xs">{(i === 0 ? 100 : 100 - step.dropFromPrevious).toFixed(2)}%</td>
                          <td className={`px-4 py-3 text-xs font-semibold ${step.dropFromPrevious > 0 ? 'text-rose-400' : 'text-zinc-500'}`}>
                            {step.dropFromPrevious > 0 ? `${step.dropFromPrevious}%` : '-'}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="px-4 py-6 text-center text-xs text-zinc-500">No measured funnel results yet</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
