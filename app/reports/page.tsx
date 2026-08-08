"use client";

import DashboardLayout from "@/components/navigation/DashboardLayout";
import { FileBarChart2, Download, Eye, Sparkles } from "lucide-react";

export default function Reports() {
  const reports = [
    {
      title: "Weekly Product Analytics",
      date: "May 24, 2025",
      description: "Summary of weekly active users, feature retention matrices, and funnel drop-off points.",
      usersCount: "8,642",
      conversionRate: "34.6%",
    },
    {
      title: "Monthly Conversion Report",
      date: "May 01, 2025",
      description: "Deep dive analysis of sign-up progression rates and checkout telemetry.",
      usersCount: "28,490",
      conversionRate: "31.2%",
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Reports</h1>
          <p className="text-sm text-zinc-400">
            Generate and export structured analytics digests for your team or stakeholders.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {reports.map((rep) => (
            <div
              key={rep.title}
              className="glow-card rounded-xl p-6 glow-indigo relative overflow-hidden flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[10px] text-zinc-500 font-semibold uppercase">
                    Generated: {rep.date}
                  </span>
                  <span className="flex items-center gap-1 text-[9px] text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded font-bold">
                    <Sparkles size={8} /> Auto
                  </span>
                </div>
                <h3 className="text-base font-bold text-white mb-2">{rep.title}</h3>
                <p className="text-xs text-zinc-400 leading-normal mb-6">{rep.description}</p>

                <div className="grid grid-cols-2 gap-4 border-t border-zinc-900 pt-4">
                  <div>
                    <span className="text-[10px] text-zinc-500 uppercase block font-bold">
                      Active Users
                    </span>
                    <span className="text-sm font-semibold text-white mt-1 block">
                      {rep.usersCount}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-500 uppercase block font-bold">
                      Conversion
                    </span>
                    <span className="text-sm font-semibold text-white mt-1 block">
                      {rep.conversionRate}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-zinc-900/40">
                <button className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 hover:text-white transition cursor-pointer">
                  <Eye size={14} /> View Report
                </button>
                <button className="flex items-center gap-1.5 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 border border-indigo-500/20 rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer">
                  <Download size={14} /> Export PDF
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
