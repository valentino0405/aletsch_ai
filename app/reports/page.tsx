"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/navigation/DashboardLayout";
import { Download, Eye, FileBarChart2, Loader2, Sparkles } from "lucide-react";

interface ReportData {
  title: string;
  date: string;
  description: string;
  usersCount: string;
  conversionRate: string;
  eventsCount: string;
  funnelSummary: string;
}

export default function Reports() {
  const [reports, setReports] = useState<ReportData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadReports() {
      try {
        const [dashboardRes, funnelRes] = await Promise.all([
          fetch("/api/dashboard"),
          fetch("/api/funnels?type=Onboarding%20Funnel"),
        ]);
        const dashboard = dashboardRes.ok ? await dashboardRes.json() : null;
        const funnel = funnelRes.ok ? await funnelRes.json() : null;
        const steps = funnel?.steps || [];
        const firstUsers = Number(steps[0]?.users || 0);
        const lastUsers = Number(steps[steps.length - 1]?.users || 0);
        const conversionRate = firstUsers > 0 ? `${Math.round((lastUsers / firstUsers) * 1000) / 10}%` : "0%";
        const generatedDate = new Date().toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        });
        const base = {
          date: generatedDate,
          usersCount: String(dashboard?.totalUsers ?? 0),
          conversionRate,
          eventsCount: String(dashboard?.eventsTracked ?? 0),
          funnelSummary: funnel?.largestDropoff
            ? `${funnel.largestDropoff.from} to ${funnel.largestDropoff.to}: ${funnel.largestDropoff.rate} drop-off`
            : "No funnel drop-off data yet.",
        };
        setReports([
          {
            ...base,
            title: "Current Product Analytics",
            description: "Live users, events, and funnel performance from the connected application.",
          },
          {
            ...base,
            title: "Current Conversion Report",
            description: "Live conversion progression and the largest observed funnel drop-off.",
          },
        ]);
      } catch (error) {
        console.error("Failed to load reports:", error);
      } finally {
        setLoading(false);
      }
    }
    loadReports();
  }, []);

  function downloadReport(report: ReportData) {
    const content = [
      report.title,
      `Generated: ${report.date}`,
      `Active users: ${report.usersCount}`,
      `Events tracked: ${report.eventsCount}`,
      `Conversion: ${report.conversionRate}`,
      report.funnelSummary,
    ].join("\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${report.title.toLowerCase().replace(/\s+/g, "-")}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Reports</h1>
          <p className="text-sm text-zinc-400">
            Generate and export structured analytics digests for your team or stakeholders.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-zinc-500">
            <Loader2 size={16} className="animate-spin" /> Loading live report data...
          </div>
        ) : (
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
                  <div>
                    <span className="text-[10px] text-zinc-500 uppercase block font-bold">Events</span>
                    <span className="text-sm font-semibold text-white mt-1 block">{rep.eventsCount}</span>
                  </div>
                </div>
                <p className="text-[10px] text-zinc-500 mt-4">{rep.funnelSummary}</p>
              </div>

              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-zinc-900/40">
                <button onClick={() => window.print()} className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 hover:text-white transition cursor-pointer">
                  <Eye size={14} /> View Report
                </button>
                <button onClick={() => downloadReport(rep)} className="flex items-center gap-1.5 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 border border-indigo-500/20 rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer">
                  <Download size={14} /> Export Report
                </button>
              </div>
            </div>
          ))}
        </div>
        )}
      </div>
    </DashboardLayout>
  );
}
