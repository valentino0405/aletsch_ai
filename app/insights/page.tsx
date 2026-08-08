"use client";

import DashboardLayout from "@/components/navigation/DashboardLayout";
import { BrainCircuit, AlertTriangle, Sparkles, TrendingUp, HelpCircle, CheckCircle2 } from "lucide-react";

export default function Insights() {
  const insights = [
    {
      type: "critical",
      title: "Onboarding Drop-off Alert",
      description: "31.6% of users abandon the application right after Sign Up. AI analysis indicates this is caused by a missing welcome redirect layout.",
      impact: "High Impact",
      recommendation: "Redirect users to /dashboard immediately after clerk authentication completes rather than keeping them on default verification screens.",
      color: "border-rose-500/30 text-rose-400 bg-rose-500/5 glow-rose",
    },
    {
      type: "opportunity",
      title: "Repository Connection Boost",
      description: "Repository connection is the primary conversion step. Users who connect a Git repository are 2.4x more likely to remain active.",
      impact: "Medium Impact",
      recommendation: "Place the 'Connect Repository' widget prominently on the dashboard welcome banner.",
      color: "border-indigo-500/30 text-indigo-400 bg-indigo-500/5 glow-indigo",
    },
    {
      type: "positive",
      title: "Onboarding Progression",
      description: "Taskflow creation stages show excellent retention. 88.5% of users who create a task completed the onboarding.",
      impact: "Low Impact",
      recommendation: "Highlight the creation success banner to trigger dopamine loops.",
      color: "border-emerald-500/30 text-emerald-400 bg-emerald-500/5 glow-emerald",
    },
  ];

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
