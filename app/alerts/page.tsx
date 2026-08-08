"use client";

import DashboardLayout from "@/components/navigation/DashboardLayout";
import { BellRing, AlertTriangle, AlertCircle, Sparkles } from "lucide-react";

export default function Alerts() {
  const alerts = [
    {
      id: "1",
      title: "High drop-off detected",
      description: "Onboarding funnel conversion dropped by 12% between Sign Up and Login steps.",
      severity: "Critical",
      category: "Funnel Analysis",
      time: "32m ago",
      colorClass: "border-rose-500/30 bg-rose-500/5 text-rose-400 glow-rose",
    },
    {
      id: "2",
      title: "Event volume spike",
      description: "Event 'repository_connected' triggered 4x more frequently than typical hourly average.",
      severity: "Warning",
      category: "Telemetry Engine",
      time: "1h ago",
      colorClass: "border-amber-500/30 bg-amber-500/5 text-amber-400 glow-amber",
    },
    {
      id: "3",
      title: "Instrumentation issues",
      description: "Code injection handler failed in Checkout.tsx on layout render hooks.",
      severity: "Warning",
      category: "Telemetry Engine",
      time: "3h ago",
      colorClass: "border-amber-500/30 bg-amber-500/5 text-amber-400 glow-amber",
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <BellRing className="text-indigo-400" />
            Alerts
          </h1>
          <p className="text-sm text-zinc-400">
            Real-time conversion anomalies and system telemetry alerts.
          </p>
        </div>

        <div className="space-y-4">
          {alerts.map((al) => (
            <div
              key={al.id}
              className={`glow-card rounded-xl p-5 border relative overflow-hidden flex flex-col sm:flex-row justify-between gap-4 ${al.colorClass}`}
            >
              <div className="flex items-start gap-3.5">
                <div className="p-2 rounded-lg bg-black/40">
                  <AlertTriangle size={18} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] uppercase font-mono font-bold px-1.5 py-0.5 rounded bg-black/40 border border-zinc-800">
                      {al.severity}
                    </span>
                    <h3 className="text-sm font-bold text-white">{al.title}</h3>
                  </div>
                  <p className="text-xs text-zinc-400 mt-1">{al.description}</p>
                  <span className="text-[10px] text-zinc-500 font-semibold block mt-3">
                    Category: {al.category}
                  </span>
                </div>
              </div>

              <div className="text-right self-end sm:self-start">
                <span className="text-xs text-zinc-500 font-semibold block">{al.time}</span>
                <button className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold mt-3 cursor-pointer">
                  Acknowledge
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
