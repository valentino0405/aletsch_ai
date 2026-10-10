"use client";

import DashboardLayout from "@/components/navigation/DashboardLayout";
import { RefreshCcw } from "lucide-react";
import { mockLifecycle } from "@/lib/mock-analytics-data";

export default function LifecyclePage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Lifecycle</h1>
            <p className="text-sm text-zinc-400">Break down active users into New, Returning, and Resurrecting.</p>
          </div>
        </div>

        <div className="glow-card rounded-xl p-6 border border-zinc-800 bg-zinc-950/50">
          <div className="flex items-center gap-2 mb-6 text-zinc-400">
            <RefreshCcw size={20} />
            <span className="text-sm font-semibold">User Lifecycle (Mock)</span>
          </div>
          <div className="space-y-4">
            {mockLifecycle.map((item, i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="w-24 text-xs font-semibold text-zinc-400">{item.category}</div>
                <div className="flex-1 h-6 bg-zinc-900 rounded-full overflow-hidden">
                  <div 
                    className={`h-full ${item.color} opacity-80`}
                    style={{ width: `${(item.users / 4520) * 100}%` }}
                  />
                </div>
                <div className="w-16 text-right text-xs font-bold text-white">{item.users.toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
