"use client";

import { useState, useEffect } from "react";
import DashboardLayout from "@/components/navigation/DashboardLayout";
import { BellRing, AlertTriangle, Loader2 } from "lucide-react";

export default function Alerts() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const acknowledge = (id: string) => {
    setAlerts((current) => current.filter((alert) => alert.id !== id));
  };

  useEffect(() => {
    async function loadAlerts() {
      try {
        const res = await fetch("/api/alerts");
        if (res.ok) {
          const json = await res.json();
          setAlerts(json);
        }
      } catch (err) {
        console.error("Failed to load alerts:", err);
      } finally {
        setLoading(false);
      }
    }
    loadAlerts();
  }, []);

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
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-zinc-500">
              <Loader2 size={16} className="animate-spin" /> Loading alerts...
            </div>
          ) : alerts.length === 0 ? (
            <div className="glow-card rounded-xl p-10 text-center text-sm text-zinc-500">
              No active alerts.
            </div>
          ) : alerts.map((al) => (
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
                  <button onClick={() => acknowledge(al.id)} className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold mt-3 cursor-pointer">
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
