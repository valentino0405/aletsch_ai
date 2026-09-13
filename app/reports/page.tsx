"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/navigation/DashboardLayout";
import { Download, Eye, Loader2, Database } from "lucide-react";

interface ReportData {
  title: string;
  date: string;
  description: string;
  usersCount: string;
  conversionRate: string;
  eventsCount: string;
  funnelSummary: string;
  /** False when the workspace has no measurable funnel yet. */
  measured: boolean;
}

export default function Reports() {
  const [reports, setReports] = useState<ReportData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadReports() {
      try {
        const [dashboardRes, funnelRes] = await Promise.all([
          fetch("/api/dashboard"),
          fetch("/api/funnels"),
        ]);
        const dashboard = dashboardRes.ok ? await dashboardRes.json() : null;
        const funnel = funnelRes.ok ? await funnelRes.json() : null;

        // The conversion rate is taken from the funnel engine rather than
        // recomputed here: two implementations of the same number will
        // eventually disagree, and one of them will be on a report.
        const measured = !!funnel && !funnel.insufficientData && funnel.conversionRate !== null;
        const conversionRate = measured ? `${funnel.conversionRate}%` : "Insufficient data";

        const generatedDate = new Date().toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        });

        const funnelSummary = !funnel || funnel.insufficientData
          ? funnel?.reason || "No events collected yet, so no funnel could be measured."
          : funnel.largestDropoff
            ? `Largest drop-off — ${funnel.largestDropoff.from} to ${funnel.largestDropoff.to}: ${funnel.largestDropoff.rate}% of users did not continue.`
            : "No drop-off measured between the observed steps.";

        setReports([
          {
            date: generatedDate,
            usersCount: String(dashboard?.totalUsers ?? 0),
            conversionRate,
            eventsCount: String(dashboard?.eventsTracked ?? 0),
            funnelSummary,
            measured,
            title: "Product Analytics Summary",
            description: measured
              ? `Users, events and funnel performance counted from recorded telemetry${funnel.funnelName ? ` for “${funnel.funnelName}”` : ""}.`
              : "Users and events counted from recorded telemetry. No funnel is measurable yet.",
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
      "",
      `Active users: ${report.usersCount}`,
      `Events tracked: ${report.eventsCount}`,
      `Conversion: ${report.conversionRate}`,
      "",
      report.funnelSummary,
      "",
      "All figures are counted from events recorded by Aletsch AI. Fields",
      "reported as “Insufficient data” were not measurable and have not",
      "been estimated.",
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
                  {!rep.measured && (
                    <span className="flex items-center gap-1 text-[9px] text-zinc-400 bg-zinc-500/10 px-1.5 py-0.5 rounded font-bold">
                      <Database size={8} /> Partial
                    </span>
                  )}
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
                    <span
                      className={`text-sm font-semibold mt-1 block ${rep.measured ? "text-white" : "text-zinc-500"}`}
                    >
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
