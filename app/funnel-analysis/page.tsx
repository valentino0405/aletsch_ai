"use client";

import { useState, useEffect } from "react";
import DashboardLayout from "@/components/navigation/DashboardLayout";
import { Filter, Sparkles, AlertTriangle, ArrowRight, TrendingUp, HelpCircle } from "lucide-react";

export default function FunnelAnalysis() {
  const [selectedFunnel, setSelectedFunnel] = useState("Onboarding Funnel");
  const [funnelData, setFunnelData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadFunnel() {
      setLoading(true);
      try {
        const res = await fetch(`/api/funnels?type=${selectedFunnel}`);
        if (res.ok) {
          const json = await res.json();
          setFunnelData(json);
        }
      } catch (err) {
        console.error("Failed to load conversion funnel details:", err);
      } finally {
        setLoading(false);
      }
    }
    loadFunnel();
  }, [selectedFunnel]);

  const funnelSteps = (funnelData?.steps || []).map((s: any, idx: number) => ({
    step: idx + 1,
    name: s.name,
    users: s.users,
    percent: s.percent,
    drop: s.drop
  }));

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Funnel Analysis</h1>
            <p className="text-sm text-zinc-400">
              Visualize user flows and identify high-friction conversion drop-offs.
            </p>
          </div>
          <select
            value={selectedFunnel}
            onChange={(e) => setSelectedFunnel(e.target.value)}
            className="bg-zinc-950/80 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-300 font-semibold outline-none cursor-pointer"
          >
            <option>Onboarding Funnel</option>
            <option>Feature Engagement</option>
            <option>Checkout Pipeline</option>
          </select>
        </div>

        {/* Big Funnel Graph Chart */}
        <div className="glow-card rounded-xl p-6 glow-indigo">
          <div className="flex items-center gap-2 mb-6">
            <h3 className="text-sm font-bold text-white">User Conversion Stages</h3>
            <span className="flex items-center gap-1 text-[9px] text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full font-bold">
              <Sparkles size={8} />
              AI Generated
            </span>
          </div>

          <div className="space-y-4">
            {funnelSteps.map((step: any) => (
              <div key={step.step} className="flex items-center gap-4">
                <div className="w-28 text-xs font-semibold text-zinc-400 truncate">
                  {step.name}
                </div>
                <div className="flex-1 h-8 bg-zinc-900/50 rounded-lg overflow-hidden border border-zinc-800/40 relative">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 opacity-80"
                    style={{ width: `${step.percent}%` }}
                  />
                  <div className="absolute inset-0 flex items-center justify-between px-3 text-[11px] font-bold text-white">
                    <span>{step.users.toLocaleString()} users</span>
                    <span>{step.percent}%</span>
                  </div>
                </div>
                <div className="w-20 text-right">
                  {step.drop > 0 ? (
                    <span className="text-xs font-semibold text-rose-500">
                      -{step.drop}% drop
                    </span>
                  ) : (
                    <span className="text-[10px] text-zinc-500 font-semibold">-</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* AI Insight explanation & Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 glow-card rounded-xl p-6 glow-purple space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Sparkles size={14} className="text-indigo-400" />
              AI Funnel Explanation
            </h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              {funnelData?.largestDropoff ? (
                <span>
                  &ldquo;The largest drop-off occurs between <strong>{funnelData.largestDropoff.from}</strong> and <strong>{funnelData.largestDropoff.to}</strong> ({funnelData.largestDropoff.rate}).
                  Based on component structures detected in your component layout, this indicates friction that could be optimized by simplifying interactions or styling controls on these route boundaries.&rdquo;
                </span>
              ) : (
                <span>
                  &ldquo;Analyze your component layout tree. Once telemetry events are ingested, Aletsch AI automatically computes conversions and drop-offs to pinpoint hotspots.&rdquo;
                </span>
              )}
            </p>
            <div className="flex items-center gap-2 text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition cursor-pointer">
              <span>View optimization opportunities</span>
              <ArrowRight size={14} />
            </div>
          </div>

          <div className="glow-card rounded-xl p-6 glow-emerald flex flex-col justify-between">
            <div className="space-y-2">
              <h3 className="text-xs uppercase font-bold text-zinc-500">
                Biggest Drop-off Stage
              </h3>
              <h4 className="text-lg font-bold text-white">
                {funnelData?.largestDropoff ? `${funnelData.largestDropoff.from} → ${funnelData.largestDropoff.to}` : "None Mapped"}
              </h4>
              <p className="text-xs text-rose-500 flex items-center gap-1 font-semibold">
                <TrendingUp size={14} className="rotate-180" /> {funnelData?.largestDropoff ? `${funnelData.largestDropoff.rate} Drop-off` : "0% Drop-off"}
              </p>
            </div>
            <div className="border-t border-zinc-900 pt-4 text-[10px] text-zinc-500">
              Computed from live workspace telemetry datasets.
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
