"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/navigation/DashboardLayout";
import {
  ArrowLeft, Sparkles, BrainCircuit, BarChart3, MousePointerClick,
  FileCode2, Users, Zap, TrendingUp, CheckCircle2, Loader2, RefreshCw, AlertTriangle
} from "lucide-react";

export default function ProjectAnalyticsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const router = useRouter();

  const [project, setProject] = useState<any>(null);
  const [components, setComponents] = useState<any[]>([]);
  const [insights, setInsights] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingInsights, setGeneratingInsights] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        // Load project details
        const pRes = await fetch("/api/projects");
        if (pRes.ok) {
          const projects = await pRes.json();
          const found = projects.find((p: any) => (p._id || p.id) === projectId);
          setProject(found || null);
        }

        // Load detected components from analysis
        const cRes = await fetch(`/api/instrumentation?projectId=${projectId}`);
        if (cRes.ok) {
          const compData = await cRes.json();
          setComponents(Array.isArray(compData) ? compData : compData.components || []);
        }

        // Load AI insights for this project
        const iRes = await fetch(`/api/insights?projectId=${projectId}`);
        if (iRes.ok) setInsights(await iRes.json());
      } catch (err) {
        console.error("Failed to load project analytics:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [projectId]);

  const handleRegenerateInsights = async () => {
    setGeneratingInsights(true);
    try {
      const res = await fetch("/api/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      if (res.ok) {
        const iRes = await fetch(`/api/insights?projectId=${projectId}`);
        if (iRes.ok) setInsights(await iRes.json());
      }
    } catch (err) {
      console.error("Failed to regenerate insights:", err);
    } finally {
      setGeneratingInsights(false);
    }
  };

  const statCards = [
    { label: "Components Detected", value: components.length, icon: FileCode2, color: "text-indigo-400" },
    { label: "Event Mappings", value: components.filter(c => c.events?.length > 0).length, icon: MousePointerClick, color: "text-cyan-400" },
    { label: "Instrumented", value: components.filter(c => c.status === "Instrumented").length, icon: CheckCircle2, color: "text-emerald-400" },
    { label: "AI Insights", value: insights.length, icon: BrainCircuit, color: "text-purple-400" },
  ];

  const categoryCount = components.reduce((acc: any, c: any) => {
    acc[c.type] = (acc[c.type] || 0) + 1;
    return acc;
  }, {});

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/projects")}
            className="p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white transition cursor-pointer"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              <BarChart3 className="text-indigo-400" />
              {project?.name || "Project"} — Analytics
            </h1>
            <p className="text-sm text-zinc-400 font-mono mt-0.5">
              {project?.repositoryUrl || "Loading..."}
            </p>
          </div>
          <div className="ml-auto">
            <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold border ${
              project?.status === "Ready"
                ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                : "text-amber-400 bg-amber-500/10 border-amber-500/20"
            }`}>
              {project?.status || "Loading"}
            </span>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-3 text-zinc-400 py-12 justify-center">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm">Loading analytics data...</span>
          </div>
        ) : (
          <>
            {/* Stat Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {statCards.map((s) => (
                <div key={s.label} className="glow-card rounded-xl p-4 space-y-2">
                  <s.icon size={16} className={s.color} />
                  <div className="text-2xl font-bold text-white">{s.value}</div>
                  <div className="text-[10px] uppercase font-bold text-zinc-500">{s.label}</div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Detected Components List */}
              <div className="lg:col-span-2 glow-card rounded-xl p-6 space-y-4">
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <MousePointerClick size={14} className="text-cyan-400" />
                  Detected Interactions & Event Mappings
                </h2>
                {components.length === 0 ? (
                  <div className="text-center py-8 text-zinc-500 text-xs">
                    <AlertTriangle size={24} className="mx-auto mb-2 text-amber-500/50" />
                    No components detected yet. Analysis may still be running.
                    <br />Check back in a minute.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                    {components.map((comp, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between bg-zinc-900/60 border border-zinc-800 rounded-lg px-4 py-3"
                      >
                        <div className="flex items-center gap-3">
                          <FileCode2 size={13} className="text-zinc-500 shrink-0" />
                          <div>
                            <p className="text-xs font-semibold text-white">{comp.name}</p>
                            <p className="text-[10px] text-zinc-500 font-mono mt-0.5">
                              {comp.type} · {comp.events?.[0] || "event_tracked"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                            {comp.status}
                          </span>
                          <span className="text-[10px] font-mono text-zinc-500">{comp.progress}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Right column */}
              <div className="space-y-4">
                {/* Component type breakdown */}
                <div className="glow-card rounded-xl p-5 space-y-3">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wide flex items-center gap-2">
                    <Zap size={13} className="text-amber-400" /> Component Breakdown
                  </h3>
                  {Object.keys(categoryCount).length === 0 ? (
                    <p className="text-xs text-zinc-500">Analysis in progress...</p>
                  ) : (
                    Object.entries(categoryCount).map(([type, count]: any) => (
                      <div key={type} className="flex justify-between items-center">
                        <span className="text-xs text-zinc-400">{type}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-indigo-500 rounded-full"
                              style={{ width: `${Math.min((count / components.length) * 100, 100)}%` }}
                            />
                          </div>
                          <span className="text-xs font-bold text-white w-4 text-right">{count}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Re-sync card */}
                <div className="glow-card rounded-xl p-5 space-y-3 glow-cyan">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wide flex items-center gap-2">
                    <RefreshCw size={13} className="text-cyan-400" /> Re-Analyze Repo
                  </h3>
                  <p className="text-[11px] text-zinc-400">
                    Trigger a fresh AST scan and re-map all detected components to events.
                  </p>
                  <button
                    onClick={() => fetch(`/api/repositories/${projectId}/sync`, { method: "POST" })}
                    className="w-full text-xs font-semibold bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/30 text-cyan-300 rounded-lg py-2 transition cursor-pointer"
                  >
                    Sync & Re-Analyze
                  </button>
                </div>
              </div>
            </div>

            {/* AI Insights Section */}
            <div className="glow-card rounded-xl p-6 glow-purple space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <BrainCircuit size={14} className="text-purple-400" />
                  AI-Generated Optimization Insights
                </h2>
                <button
                  onClick={handleRegenerateInsights}
                  disabled={generatingInsights}
                  className="flex items-center gap-1.5 text-xs font-semibold text-purple-400 hover:text-purple-300 transition cursor-pointer disabled:opacity-50"
                >
                  {generatingInsights ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                  {generatingInsights ? "Generating..." : "Regenerate"}
                </button>
              </div>

              {insights.length === 0 ? (
                <div className="text-center py-6 text-zinc-500 text-xs space-y-2">
                  <BrainCircuit size={24} className="mx-auto text-purple-500/30" />
                  <p>No insights generated yet.</p>
                  <button
                    onClick={handleRegenerateInsights}
                    disabled={generatingInsights}
                    className="mx-auto flex items-center gap-1.5 text-xs font-semibold bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-300 rounded-lg px-4 py-2 transition cursor-pointer"
                  >
                    {generatingInsights ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                    Generate AI Insights
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {insights.map((ins, idx) => (
                    <div key={idx} className={`rounded-xl p-4 border space-y-2 ${ins.color}`}>
                      <span className="text-[9px] uppercase font-bold px-2 py-0.5 rounded bg-black/40 border border-zinc-800">
                        {ins.type}
                      </span>
                      <h4 className="text-xs font-bold text-white">{ins.title}</h4>
                      <p className="text-[11px] text-zinc-400 leading-relaxed">{ins.description}</p>
                      {ins.recommendation && (
                        <div className="pt-2 border-t border-zinc-800 text-[10px] text-zinc-500">
                          <span className="font-bold text-zinc-300">Rec: </span>{ins.recommendation}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
