"use client";

import { useState, useEffect } from "react";
import DashboardLayout from "@/components/navigation/DashboardLayout";
import { BrainCircuit, AlertTriangle, Sparkles, TrendingUp, HelpCircle, CheckCircle2 } from "lucide-react";

export default function Insights() {
  const [insights, setInsights] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadInsights() {
      try {
        const res = await fetch("/api/insights");
        if (res.ok) {
          const json = await res.json();
          setInsights(json);
        }
      } catch (err) {
        console.error("Failed to load insights:", err);
      } finally {
        setLoading(false);
      }
    }
    loadInsights();
  }, []);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <BrainCircuit className="text-indigo-400" />
            AI Insights
          </h1>
          <p className="text-sm text-zinc-400">
            Intelligent analysis engine scanning user interactions to identify optimization vectors.
          </p>
        </div>

        {/* Insights list */}
        <div className="space-y-6">
          {insights.map((ins, idx) => (
            <div
              key={idx}
              className={`glow-card rounded-xl p-6 border relative overflow-hidden flex flex-col justify-between ${ins.color}`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] uppercase font-bold px-2 py-0.5 rounded bg-black/40 border border-zinc-800">
                      {ins.type}
                    </span>
                    <h3 className="text-sm font-bold text-white">{ins.title}</h3>
                  </div>
                  <span className="text-[10px] font-semibold text-zinc-400">{ins.impact}</span>
                </div>

                <p className="text-xs text-zinc-300 leading-relaxed mb-4">{ins.description}</p>

                <div className="p-4 bg-black/40 border border-zinc-900 rounded-lg text-xs text-zinc-400">
                  <span className="font-bold text-white block mb-1">Recommendation:</span>
                  {ins.recommendation}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
