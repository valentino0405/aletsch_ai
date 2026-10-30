"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/navigation/DashboardLayout";
import { AlertTriangle, Database, RefreshCw, Filter, MoreHorizontal, Plus, Download, ChevronDown, Activity, Clock, Users, Play, LineChart, PieChart } from "lucide-react";
import { mockFunnelBreakdown, mockDeviceType } from "@/lib/mock-analytics-data";

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
              className="bg-card-dark border border-zinc-800 rounded-lg px-4 py-2 text-sm text-zinc-300 font-semibold outline-none cursor-pointer"
            >
              <option value="">Auto-derived from events</option>
              {savedFunnels.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <button className="bg-card-dark border border-zinc-800 text-zinc-300 hover:text-white px-4 py-2 rounded-lg text-sm font-semibold transition">
              Share
            </button>
            <button className="bg-accent hover:bg-accent-hover text-on-accent px-4 py-2 rounded-lg text-sm font-semibold transition flex items-center gap-2">
              <Database size={16} /> Save Funnel
            </button>
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
            <div className="bg-card-dark border border-zinc-800 rounded-xl p-5">
              <h3 className="text-sm font-bold text-white mb-1">Funnel Definition</h3>
              <p className="text-[11px] text-zinc-500 mb-6">Define the steps and conditions for your funnel.</p>

              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-semibold text-zinc-400">Graph type</span>
                <select className="bg-zinc-900 border border-zinc-800 rounded text-xs text-white px-2 py-1 outline-none">
                  <option>Conversion steps</option>
                </select>
              </div>

              {/* Steps Mock */}
              <div className="space-y-3 mb-6 relative">
                {/* Connecting line */}
                <div className="absolute left-3.5 top-5 bottom-5 w-px bg-zinc-800 -z-10"></div>

                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-accent text-on-accent flex items-center justify-center text-xs font-bold shrink-0 z-10">1</div>
                  <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-white">Pageview</span>
                      <MoreHorizontal size={14} className="text-zinc-500 cursor-pointer" />
                    </div>
                    <div className="flex flex-col gap-2 pl-2 border-l border-zinc-700 ml-1">
                      <div className="flex items-center gap-2 text-[11px]">
                        <span className="text-zinc-500">where</span>
                        <div className="bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded flex items-center gap-1">
                          Current URL <ChevronDown size={10} />
                        </div>
                        <span className="text-zinc-300">contains</span>
                        <span className="text-indigo-400 font-mono">/pricing</span>
                      </div>
                      <button className="w-fit flex items-center gap-1 text-[10px] text-zinc-400 hover:text-white bg-zinc-800 px-2 py-1 rounded transition">
                        <Plus size={10} /> Add filter
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-accent text-on-accent flex items-center justify-center text-xs font-bold shrink-0 z-10">2</div>
                  <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg p-3 flex items-center justify-between">
                    <span className="text-xs font-semibold text-white">Account Created</span>
                    <MoreHorizontal size={14} className="text-zinc-500 cursor-pointer" />
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-accent text-on-accent flex items-center justify-center text-xs font-bold shrink-0 z-10">3</div>
                  <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg p-3 flex items-center justify-between">
                    <span className="text-xs font-semibold text-white">Project Created</span>
                    <MoreHorizontal size={14} className="text-zinc-500 cursor-pointer" />
                  </div>
                </div>
                
                <button className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition font-semibold ml-2">
                  <Plus size={14} /> Add step
                </button>
              </div>

              {/* Advanced config */}
              <div className="space-y-4 pt-4 border-t border-zinc-800">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-400">Conversion window</span>
                  <div className="flex items-center gap-2">
                    <input type="number" defaultValue={14} className="bg-zinc-900 border border-zinc-800 rounded w-12 text-xs text-white px-2 py-1 outline-none text-center" />
                    <select className="bg-zinc-900 border border-zinc-800 rounded text-xs text-white px-2 py-1 outline-none">
                      <option>Days</option>
                    </select>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-400">Step order</span>
                  <select className="bg-zinc-900 border border-zinc-800 rounded text-xs text-white px-2 py-1 outline-none">
                    <option>Sequential</option>
                  </select>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-400">Calculation</span>
                  <select className="bg-zinc-900 border border-zinc-800 rounded text-xs text-white px-2 py-1 outline-none">
                    <option>Overall conversion</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Right Panel: Results Area */}
          <div className="flex-1 flex flex-col gap-6 overflow-y-auto pr-2 pb-10">
            
            {/* Top Toolbar */}
            <div className="flex items-center justify-between bg-card-dark border border-zinc-800 rounded-xl p-3">
              <div className="flex items-center gap-3">
                <select className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-white font-medium outline-none">
                  <option>Last 30 days</option>
                  <option>Last 7 days</option>
                </select>
                <button className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-300 font-medium hover:text-white transition">
                  <Filter size={14} /> Add filter
                </button>
              </div>
              <div className="flex items-center gap-3">
                <button className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-300 font-medium hover:text-white transition">
                  <Play size={14} /> Run experiment
                </button>
                <div className="h-4 w-px bg-zinc-800"></div>
                <span className="text-[10px] text-zinc-500">Updated just now</span>
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
              <div className="glow-card rounded-xl p-4 border border-zinc-800 bg-card-dark flex items-center gap-4">
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
              <div className="glow-card rounded-xl p-4 border border-zinc-800 bg-card-dark flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400">
                  <Clock size={20} />
                </div>
                <div>
                  <h3 className="text-[11px] uppercase font-bold text-zinc-500 tracking-wider">Avg Time to Convert</h3>
                  <div className="text-xl font-bold text-white mt-0.5">
                     {/* Mock display, as the backend doesn't provide time yet */}
                     {hasFunnel ? "12m 45s" : "—"}
                  </div>
                </div>
              </div>
              <div className="glow-card rounded-xl p-4 border border-zinc-800 bg-card-dark flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center text-cyan-400">
                  <Users size={20} />
                </div>
                <div>
                  <h3 className="text-[11px] uppercase font-bold text-zinc-500 tracking-wider">Unique Users</h3>
                  <div className="text-xl font-bold text-white mt-0.5">
                    {funnelData?.totalUsers?.toLocaleString() || "0"}
                  </div>
                </div>
              </div>
            </div>

            {/* Chart Area */}
            <div className="glow-card rounded-xl p-6 border border-zinc-800 bg-card-dark glow-indigo">
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
                          className="h-full bg-accent hover:bg-accent-hover transition-colors cursor-pointer"
                          style={{ width: `${Math.max(0, Math.min(100, step.percent))}%` }}
                        />
                        <div className="absolute inset-0 flex items-center justify-between px-3 pointer-events-none">
                          <span className="text-[11px] font-bold text-white drop-shadow-md">
                            {step.users.toLocaleString()} users ({step.percent}%)
                          </span>
                          <span className="text-[11px] font-bold text-white drop-shadow-md">{step.percent}%</span>
                        </div>
                      </div>
                      {index > 0 && (
                        <div className="flex justify-end text-[10px] text-zinc-500 font-medium">
                          Average time to convert: {Math.floor(Math.random() * 10) + 1}m {Math.floor(Math.random() * 60)}s (Mock)
                        </div>
                      )}
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
                </div>
              )}
            </div>

            {/* Detailed Results Table */}
            <div className="glow-card rounded-xl border border-zinc-800 bg-card-dark overflow-hidden">
              <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
                <h3 className="text-sm font-bold text-white">Detailed Results</h3>
                <button className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 hover:text-white transition">
                  <Download size={14} /> Export
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-zinc-900/50 text-[10px] text-zinc-500 uppercase font-bold tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Step</th>
                      <th className="px-4 py-3">Users</th>
                      <th className="px-4 py-3">Conversion</th>
                      <th className="px-4 py-3">Drop-off</th>
                      <th className="px-4 py-3">Median Time (Mock)</th>
                      <th className="px-4 py-3">Average Time (Mock)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50">
                    {hasFunnel ? (
                      steps.map((step, i) => (
                        <tr key={i} className="hover:bg-zinc-900/30 transition">
                          <td className="px-4 py-3 font-medium text-white flex items-center gap-2">
                            <div className="w-4 h-4 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-[9px] font-bold">{i + 1}</div>
                            {step.name}
                          </td>
                          <td className="px-4 py-3 text-zinc-300 font-mono text-xs">{step.users.toLocaleString()}</td>
                          <td className="px-4 py-3 text-zinc-300 text-xs">{(i === 0 ? 100 : 100 - step.dropFromPrevious).toFixed(2)}%</td>
                          <td className={`px-4 py-3 text-xs font-semibold ${step.dropFromPrevious > 0 ? 'text-rose-400' : 'text-zinc-500'}`}>
                            {step.dropFromPrevious > 0 ? `${step.dropFromPrevious}%` : '-'}
                          </td>
                          <td className="px-4 py-3 text-zinc-500 text-xs">{i === 0 ? '-' : '2m 14s'}</td>
                          <td className="px-4 py-3 text-zinc-500 text-xs">{i === 0 ? '-' : '4m 32s'}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="px-4 py-6 text-center text-xs text-zinc-500">No data available</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Breakdown Section (Mock) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 glow-card rounded-xl border border-zinc-800 bg-card-dark overflow-hidden flex flex-col">
                <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white">Breakdown</h3>
                  <select className="bg-zinc-900 border border-zinc-800 rounded text-xs text-white px-2 py-1 outline-none">
                    <option>Country</option>
                    <option>Browser</option>
                  </select>
                </div>
                <div className="overflow-x-auto flex-1">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-zinc-900/50 text-[10px] text-zinc-500 uppercase font-bold tracking-wider">
                      <tr>
                        <th className="px-4 py-3">Country (Mock)</th>
                        <th className="px-4 py-3">Users</th>
                        <th className="px-4 py-3">Conversion Rate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/50">
                      {mockFunnelBreakdown.map((row, i) => (
                        <tr key={i} className="hover:bg-zinc-900/30 transition">
                          <td className="px-4 py-3 font-medium text-white flex items-center gap-2">
                             {/* Flag placeholder */}
                             <div className="w-4 h-3 bg-zinc-800 rounded-sm"></div>
                             {row.country}
                          </td>
                          <td className="px-4 py-3 text-zinc-300 font-mono text-xs">{row.users.toLocaleString()}</td>
                          <td className="px-4 py-3 text-zinc-300 text-xs">{row.conversion}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="glow-card rounded-xl border border-zinc-800 bg-card-dark p-4 flex flex-col">
                <h3 className="text-sm font-bold text-white mb-4">Device Type (Mock)</h3>
                <div className="flex-1 flex flex-col items-center justify-center">
                  <div className="w-32 h-32 rounded-full border-[16px] border-zinc-800 relative mb-6">
                    {/* CSS Mock of a donut chart */}
                    <div className="absolute inset-[-16px] rounded-full border-[16px] border-indigo-500 border-r-transparent border-b-transparent transform -rotate-45"></div>
                    <div className="absolute inset-[-16px] rounded-full border-[16px] border-cyan-500 border-l-transparent border-t-transparent transform rotate-[45deg] scale-105 opacity-80"></div>
                    
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-xs font-bold text-white">13,000</span>
                      <span className="text-[9px] text-zinc-500 uppercase font-bold">Users</span>
                    </div>
                  </div>
                  
                  <div className="w-full space-y-2">
                    {mockDeviceType.map((d, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${d.color}`}></div>
                          <span className="text-zinc-400 font-medium">{d.type}</span>
                        </div>
                        <span className="text-zinc-300 font-mono">{d.users}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
