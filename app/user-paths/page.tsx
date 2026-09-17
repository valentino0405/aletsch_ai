"use client";

import DashboardLayout from "@/components/navigation/DashboardLayout";
import { Route } from "lucide-react";
import { mockUserPaths } from "@/lib/mock-analytics-data";

export default function UserPathsPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">User Paths</h1>
            <p className="text-sm text-zinc-400">Discover the sequences of events users perform.</p>
          </div>
        </div>

        <div className="glow-card rounded-xl p-6 border border-zinc-800 bg-zinc-950/50">
          <div className="flex items-center gap-2 mb-6 text-zinc-400">
            <Route size={20} />
            <span className="text-sm font-semibold">Common User Paths (Mock)</span>
          </div>
          <div className="space-y-4">
            {mockUserPaths.map((path, i) => (
              <div key={i} className="flex items-center justify-between p-4 bg-zinc-900/50 rounded-lg border border-zinc-800/50">
                <div className="text-sm font-medium text-indigo-300">{path.path}</div>
                <div className="flex flex-col items-end">
                  <span className="text-sm font-bold text-white">{path.users.toLocaleString()} users</span>
                  <span className="text-xs font-semibold text-zinc-500">{path.percent}% of traffic</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
