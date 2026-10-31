"use client";

import DashboardLayout from "@/components/navigation/DashboardLayout";
import { Magnet } from "lucide-react";
import { mockStickiness } from "@/lib/mock-analytics-data";

export default function StickinessPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Stickiness</h1>
            <p className="text-sm text-zinc-400">Understand how often users engage with your product.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="glow-card rounded-xl p-4 border border-zinc-800 bg-zinc-950/50">
            <h3 className="text-xs text-zinc-500 font-medium">DAU</h3>
            <div className="text-2xl font-bold text-white mt-1">12.5k</div>
          </div>
          <div className="glow-card rounded-xl p-4 border border-zinc-800 bg-zinc-950/50">
            <h3 className="text-xs text-zinc-500 font-medium">WAU</h3>
            <div className="text-2xl font-bold text-white mt-1">45.2k</div>
          </div>
          <div className="glow-card rounded-xl p-4 border border-zinc-800 bg-zinc-950/50">
            <h3 className="text-xs text-zinc-500 font-medium">MAU</h3>
            <div className="text-2xl font-bold text-white mt-1">128.4k</div>
          </div>
          <div className="glow-card rounded-xl p-4 border border-zinc-800 bg-zinc-950/50">
            <h3 className="text-xs text-zinc-500 font-medium">DAU / MAU Ratio</h3>
            <div className="text-2xl font-bold text-white mt-1">9.7%</div>
          </div>
        </div>

        <div className="glow-card rounded-xl p-6 border border-zinc-800 bg-zinc-950/50">
          <div className="flex items-center gap-2 mb-6 text-zinc-400">
            <Magnet size={20} />
            <span className="text-sm font-semibold">Frequency of Use (Mock)</span>
          </div>
          <div className="flex h-12 bg-zinc-900 rounded-lg overflow-hidden">
            {mockStickiness.map((item, i) => (
              <div 
                key={i} 
                className="h-full flex items-center justify-center text-xs font-bold text-paper border-r border-zinc-800 last:border-0"
                style={{ width: `${item.percent}%`, backgroundColor: `color-mix(in srgb, var(--color-secondary) ${25 + i * 10}%, var(--color-zinc-950))` }}
              >
                {item.frequency} ({item.percent}%)
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
