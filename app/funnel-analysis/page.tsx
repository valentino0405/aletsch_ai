"use client";

import { useState, useEffect, useCallback } from "react";
import DashboardLayout from "@/components/navigation/DashboardLayout";
import { AlertTriangle, ArrowRight, TrendingUp, Database, RefreshCw } from "lucide-react";

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

/** Says where the steps came from, rather than implying a model produced them. */
const SOURCE_LABEL: Record<string, string> = {
  saved: "Saved definition",
  "derived-from-catalog": "Derived from AI event stages",
  "derived-from-events": "Derived from observed events",
};

export default function FunnelAnalysis() {
  const [selectedFunnel, setSelectedFunnel] = useState("");
  const [funnelData, setFunnelData] = useState<FunnelResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadFunnel = useCallback(async (name: string) => {
    setLoading(true);
    setError("");
    try {
      // The route derives a funnel from real events when no saved name is
      // given; `name` selects a saved definition instead.
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
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Funnel Analysis</h1>
            <p className="text-sm text-zinc-400">
              Visualize user flows and identify high-friction conversion drop-offs.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {savedFunnels.length > 0 && (
              <select
                value={selectedFunnel}
                onChange={(e) => setSelectedFunnel(e.target.value)}
                className="bg-zinc-950/80 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-300 font-semibold outline-none cursor-pointer"
              >
                <option value="">Auto-derived from events</option>
                {savedFunnels.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={() => loadFunnel(selectedFunnel)}
              disabled={loading}
              className="flex items-center gap-1.5 bg-zinc-950/80 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-300 font-semibold hover:text-white transition disabled:opacity-50"
            >
              <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="glow-card rounded-xl p-4 border border-rose-500/30 flex items-center gap-2 text-xs text-rose-400 font-semibold">
            <AlertTriangle size={14} />
            {error}
          </div>
        )}

        {/* Big Funnel Graph Chart */}
        <div className="glow-card rounded-xl p-6 glow-indigo">
          <div className="flex items-center gap-2 mb-6">
            <h3 className="text-sm font-bold text-white">
              {funnelData?.funnelName || "User Conversion Stages"}
            </h3>
            {funnelData?.source && (
              <span className="text-[9px] text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full font-bold">
                {SOURCE_LABEL[funnelData.source] ?? funnelData.source}
              </span>
            )}
          </div>

          {loading ? (
            <div className="space-y-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-8 bg-zinc-900/50 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : hasFunnel ? (
            <div className="space-y-4">
              {steps.map((step) => (
                <div key={step.event} className="flex items-center gap-4">
                  <div className="w-28 text-xs font-semibold text-zinc-400 truncate" title={step.event}>
                    {step.name}
                  </div>
                  <div className="flex-1 h-8 bg-zinc-900/50 rounded-lg overflow-hidden border border-zinc-800/40 relative">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 opacity-80"
                      style={{ width: `${Math.max(0, Math.min(100, step.percent))}%` }}
                    />
                    <div className="absolute inset-0 flex items-center justify-between px-3 text-[11px] font-bold text-white">
                      <span>{step.users.toLocaleString()} users</span>
                      <span>{step.percent}%</span>
                    </div>
                  </div>
                  <div className="w-20 text-right">
                    {step.dropFromPrevious > 0 ? (
                      <span className="text-xs font-semibold text-rose-500">
                        -{step.dropFromPrevious}% drop
                      </span>
                    ) : (
                      <span className="text-[10px] text-zinc-500 font-semibold">-</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Database size={28} className="text-zinc-700 mb-3" />
              <p className="text-sm font-bold text-zinc-400">Insufficient data to build a funnel</p>
              <p className="text-xs text-zinc-500 mt-1 max-w-md">
                {funnelData?.reason ||
                  "Instrument a repository and collect events, and the stages will be measured from them."}
              </p>
            </div>
          )}
        </div>

        {/* Measured summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 glow-card rounded-xl p-6 glow-purple space-y-4">
            <h3 className="text-sm font-bold text-white">Where users are lost</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              {hasFunnel && funnelData?.largestDropoff ? (
                <span>
                  The largest drop-off is between <strong>{funnelData.largestDropoff.from}</strong> and{" "}
                  <strong>{funnelData.largestDropoff.to}</strong>, where{" "}
                  <strong>{funnelData.largestDropoff.rate}%</strong> of users who reached the first step
                  did not reach the next.{" "}
                  {funnelData.conversionRate !== null && (
                    <>
                      End-to-end, <strong>{funnelData.conversionRate}%</strong> of the{" "}
                      {funnelData.totalUsers.toLocaleString()} users who entered completed the final step.
                    </>
                  )}
                </span>
              ) : hasFunnel ? (
                <span>No drop-off has been measured between these steps yet.</span>
              ) : (
                <span>
                  Drop-offs are computed from recorded events. None have been collected for this
                  workspace, so there is nothing to report.
                </span>
              )}
            </p>
            {hasFunnel && (
              <a
                href="/insights"
                className="flex items-center gap-2 text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition w-fit"
              >
                <span>View AI insights for this funnel</span>
                <ArrowRight size={14} />
              </a>
            )}
          </div>

          <div className="glow-card rounded-xl p-6 glow-emerald flex flex-col justify-between">
            <div className="space-y-2">
              <h3 className="text-xs uppercase font-bold text-zinc-500">Biggest Drop-off Stage</h3>
              <h4 className="text-lg font-bold text-white">
                {funnelData?.largestDropoff
                  ? `${funnelData.largestDropoff.from} → ${funnelData.largestDropoff.to}`
                  : "Not measured"}
              </h4>
              <p className="text-xs text-rose-500 flex items-center gap-1 font-semibold">
                {funnelData?.largestDropoff ? (
                  <>
                    <TrendingUp size={14} className="rotate-180" />
                    {funnelData.largestDropoff.rate}% drop-off
                  </>
                ) : (
                  <span className="text-zinc-500">Insufficient data</span>
                )}
              </p>
            </div>
            <div className="border-t border-zinc-900 pt-4 text-[10px] text-zinc-500">
              {hasFunnel
                ? `Counted from ${funnelData?.totalUsers.toLocaleString()} distinct users in the events collection.`
                : "No events recorded for this workspace."}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
