"use client";

import { useUser } from "@clerk/nextjs";
import { useState, useEffect, useCallback } from "react";
import DashboardLayout from "@/components/navigation/DashboardLayout";
import {
  Users as UsersIcon,
  Activity,
  Flame,
  Clock,
  AlertTriangle,
  Sparkles,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Code,
  CheckCircle2,
  Calendar,
  ChevronDown,
  GitBranch,
  MousePointerClick,
  Zap,
  FolderOpen,
  BarChart3,
  Loader2,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────

interface ProjectMeta {
  id: string;
  name: string;
  status: string;
  repositoryUrl: string;
}

interface DashboardData {
  totalUsers: string | number;
  eventsTracked: string | number;
  componentsDetected: number;
  reposConnected: number;
  conversionRate: string;
  averageSessionTime: string;
  atRiskDropoffs: number;
  funnel: any[];
  topEvents: any[];
  recentActivity: any[];
  projects: ProjectMeta[];
  selectedProject: ProjectMeta | null;
  analysis: {
    filesScanned: number;
    filesParsed: number;
    componentsDetected: number;
    routesDetected: number;
    interactionsDetected: number;
    status: string;
    completedAt: string;
  } | null;
  systemHealth: {
    repoConnection: number;
    eventProcessing: number;
    aiAnalysis: number;
    dashboardService: number;
  };
}

export default function Dashboard() {
  const { user, isLoaded } = useUser();
  const [dateRange, setDateRange] = useState("Last 7 days");
  const [showRangeDropdown, setShowRangeDropdown] = useState(false);
  const [data, setData] = useState<DashboardData | null>(null);
  const [insights, setInsights] = useState<any[]>([]);
  const [components, setComponents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);

  // Fetch all data for the selected project
  const fetchAll = useCallback(async (projectId?: string) => {
    setLoading(true);
    try {
      const pid = projectId || selectedProjectId;
      const params = pid ? `?projectId=${pid}` : "";

      const [dashRes, insightsRes, compRes] = await Promise.all([
        fetch(`/api/dashboard${params}`),
        fetch(`/api/insights${pid ? `?projectId=${pid}` : ""}`),
        fetch(`/api/instrumentation${pid ? `?projectId=${pid}` : ""}`),
      ]);

      if (dashRes.ok) {
        const dashData = await dashRes.json();
        setData(dashData);
        // Bootstrap project list from first response
        if (dashData.projects?.length > 0) {
          setProjects(dashData.projects);
          if (!selectedProjectId && dashData.projects[0]) {
            setSelectedProjectId(dashData.projects[0].id);
          }
        }
      }
      if (insightsRes.ok) setInsights(await insightsRes.json());
      if (compRes.ok) {
        const compData = await compRes.json();
        setComponents(Array.isArray(compData) ? compData : compData.components || []);
      }
    } catch (err) {
      console.error("Failed to load dashboard:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId]);

  // Initial load
  useEffect(() => {
    fetchAll();
  }, []);

  // Re-fetch when project changes
  const handleProjectSelect = (proj: ProjectMeta) => {
    setSelectedProjectId(proj.id);
    setShowProjectDropdown(false);
    fetchAll(proj.id);
  };

  const selectedProject = projects.find((p) => p.id === selectedProjectId) || data?.selectedProject || null;

  const metrics = [
    {
      title: "Total Users",
      value: String(data?.totalUsers ?? "0"),
      change: "+12.5%",
      isPositive: true,
      icon: UsersIcon,
      colorClass: "text-indigo-400",
      bgClass: "bg-indigo-500/10",
      glowClass: "glow-indigo",
      sparkline: [20, 35, 30, 45, 40, 55, 52],
    },
    {
      title: "Events Tracked",
      value: String(data?.eventsTracked ?? "0"),
      change: "+18.3%",
      isPositive: true,
      icon: Activity,
      colorClass: "text-purple-400",
      bgClass: "bg-purple-500/10",
      glowClass: "glow-purple",
      sparkline: [10, 15, 25, 20, 35, 42, 47],
    },
    {
      title: "Repos Connected",
      value: String(data?.reposConnected ?? "0"),
      change: "Active",
      isPositive: true,
      icon: GitBranch,
      colorClass: "text-cyan-400",
      bgClass: "bg-cyan-500/10",
      glowClass: "glow-cyan",
      sparkline: [0, 0, 1, 1, 1, 1, data?.reposConnected || 1],
    },
    {
      title: "Interactions",
      value: String(data?.analysis?.interactionsDetected ?? data?.componentsDetected ?? "0"),
      change: "Auto-detected",
      isPositive: true,
      icon: MousePointerClick,
      colorClass: "text-emerald-400",
      bgClass: "bg-emerald-500/10",
      glowClass: "glow-emerald",
      sparkline: [0, 2, 5, 8, 12, 18, data?.componentsDetected || 0],
    },
    {
      title: "At Risk Drop-offs",
      value: String(data?.atRiskDropoffs ?? "0"),
      change: "-2 vs last week",
      isPositive: true,
      icon: AlertTriangle,
      colorClass: "text-rose-400",
      bgClass: "bg-rose-500/10",
      glowClass: "glow-rose",
      sparkline: [7, 6, 5, 5, 4, 3, 3],
    },
  ];

  const funnelSteps =
    data?.funnel && data.funnel.length > 0
      ? data.funnel
      : [
          { name: "Landing Page", rate: "100%", users: "0", drop: null, active: true },
          { name: "Sign Up", rate: "0%", users: "0", drop: "0%", active: true },
          { name: "Login", rate: "0%", users: "0", drop: "0%", active: true },
          { name: "Create Task", rate: "0%", users: "0", drop: "0%", active: true },
          { name: "Task Completed", rate: "0%", users: "0", drop: "0%", active: true },
        ];

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* ── Header ── */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              Welcome back, {isLoaded && user ? user.firstName : "Developer"}! 👋
            </h1>
            <p className="text-sm text-zinc-400">
              Here&apos;s what&apos;s happening with your application today.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Project Selector */}
            <div className="relative">
              <button
                id="project-selector-btn"
                onClick={() => setShowProjectDropdown(!showProjectDropdown)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-zinc-700 bg-zinc-900 text-xs font-semibold text-zinc-200 hover:border-indigo-500/50 hover:text-white transition min-w-[180px] justify-between"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FolderOpen size={13} className="text-indigo-400 shrink-0" />
                  <span className="truncate">
                    {loading && !selectedProject
                      ? "Loading..."
                      : selectedProject?.name || "Select Project"}
                  </span>
                </div>
                <ChevronDown
                  size={13}
                  className={`text-zinc-500 shrink-0 transition-transform ${showProjectDropdown ? "rotate-180" : ""}`}
                />
              </button>

              {showProjectDropdown && (
                <div className="absolute right-0 mt-2 w-56 rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl p-1 z-50">
                  {projects.length === 0 ? (
                    <div className="px-3 py-4 text-center text-xs text-zinc-500">
                      No projects yet.{" "}
                      <a href="/projects" className="text-indigo-400 hover:underline">
                        Add one
                      </a>
                    </div>
                  ) : (
                    <>
                      {projects.map((proj) => (
                        <button
                          key={proj.id}
                          onClick={() => handleProjectSelect(proj)}
                          className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-medium transition flex items-center gap-2.5 ${
                            selectedProjectId === proj.id
                              ? "bg-indigo-600/15 text-indigo-300 border border-indigo-500/20"
                              : "text-zinc-300 hover:bg-zinc-900 hover:text-white"
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                              proj.status === "Ready" || proj.status === "Analyzing"
                                ? "bg-emerald-400"
                                : "bg-zinc-600"
                            }`}
                          />
                          <span className="truncate">{proj.name}</span>
                          {selectedProjectId === proj.id && (
                            <CheckCircle2 size={11} className="text-indigo-400 ml-auto shrink-0" />
                          )}
                        </button>
                      ))}
                      <div className="border-t border-zinc-800 mt-1 pt-1">
                        <a
                          href="/projects"
                          className="w-full text-left px-3 py-2 rounded-lg text-xs text-indigo-400 hover:bg-zinc-900 hover:text-indigo-300 transition flex items-center gap-2"
                        >
                          <Zap size={11} />
                          Manage Projects
                        </a>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Date range picker */}
            <div className="relative">
              <button
                onClick={() => setShowRangeDropdown(!showRangeDropdown)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-zinc-800/80 bg-zinc-950/40 text-xs font-semibold text-zinc-300 hover:text-white transition"
              >
                <Calendar size={13} className="text-indigo-400" />
                <span>{dateRange}</span>
                <ChevronDown size={13} className="text-zinc-500" />
              </button>
              {showRangeDropdown && (
                <div className="absolute right-0 mt-2 w-48 rounded-lg border border-zinc-800 bg-zinc-950 shadow-2xl p-1 z-50">
                  {["Today", "Last 7 days", "Last 30 days", "Custom range"].map((range) => (
                    <button
                      key={range}
                      onClick={() => {
                        setDateRange(range);
                        setShowRangeDropdown(false);
                      }}
                      className="w-full text-left px-3 py-2 rounded-md text-xs hover:bg-zinc-900 text-zinc-300 hover:text-white transition"
                    >
                      {range}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Selected project badge */}
        {selectedProject && (
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-zinc-800/60 bg-zinc-900/40 w-fit">
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <BarChart3 size={13} className="text-indigo-400" />
              <span>Viewing analytics for</span>
              <span className="font-bold text-white">{selectedProject.name}</span>
            </div>
            <span className="text-[10px] font-mono text-zinc-600 border border-zinc-800 rounded px-1.5 py-0.5 truncate max-w-[200px]">
              {selectedProject.repositoryUrl?.replace("https://", "")}
            </span>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                selectedProject.status === "Ready"
                  ? "bg-emerald-500/10 text-emerald-400"
                  : selectedProject.status === "Analyzing"
                  ? "bg-amber-500/10 text-amber-400"
                  : "bg-zinc-800 text-zinc-400"
              }`}
            >
              {selectedProject.status || "Connected"}
            </span>
          </div>
        )}

        {/* No project selected / no projects state */}
        {!loading && projects.length === 0 && (
          <div className="glow-card rounded-xl p-10 text-center">
            <FolderOpen size={36} className="mx-auto text-zinc-600 mb-4" />
            <h3 className="text-sm font-bold text-white mb-2">No Projects Connected</h3>
            <p className="text-xs text-zinc-500 mb-4">
              Connect a GitHub repository to start tracking analytics.
            </p>
            <a
              href="/projects"
              className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-xs font-semibold transition"
            >
              <Zap size={12} />
              Connect Your First Project
            </a>
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-3 text-zinc-500 py-8 justify-center">
            <Loader2 size={18} className="animate-spin text-indigo-400" />
            <span className="text-sm">Loading project analytics...</span>
          </div>
        )}

        {!loading && projects.length > 0 && (
          <>
            {/* ── Metric Cards ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {metrics.map((metric) => {
                const Icon = metric.icon;
                const maxVal = Math.max(...metric.sparkline);
                const minVal = Math.min(...metric.sparkline);
                const pathData = metric.sparkline
                  .map((val, i) => {
                    const x = (i / (metric.sparkline.length - 1)) * 100;
                    const range = maxVal - minVal || 1;
                    const y = 8 + 24 - ((val - minVal) / range) * 24;
                    return `${i === 0 ? "M" : "L"} ${x} ${y}`;
                  })
                  .join(" ");

                return (
                  <div
                    key={metric.title}
                    className={`glow-card rounded-xl p-4 flex flex-col justify-between overflow-hidden relative ${metric.glowClass}`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs text-zinc-400 font-medium">{metric.title}</span>
                      <div className={`p-1.5 rounded-lg ${metric.bgClass} ${metric.colorClass}`}>
                        <Icon size={14} />
                      </div>
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white tracking-tight">{metric.value}</h3>
                      <div className="flex items-center gap-1 mt-1">
                        {metric.isPositive ? (
                          <TrendingUp size={12} className="text-emerald-400" />
                        ) : (
                          <TrendingDown size={12} className="text-rose-400" />
                        )}
                        <span
                          className={`text-[10px] font-semibold ${
                            metric.isPositive ? "text-emerald-400" : "text-rose-400"
                          }`}
                        >
                          {metric.change}
                        </span>
                      </div>
                    </div>
                    <div className="h-10 mt-3 -mx-4 -mb-4 overflow-hidden relative opacity-60">
                      <svg className="w-full h-full" viewBox="0 0 100 40" preserveAspectRatio="none">
                        <path
                          d={pathData}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          className={metric.colorClass}
                        />
                      </svg>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── Analysis Summary Banner (if analysis exists) ── */}
            {data?.analysis && (
              <div className="glow-card rounded-xl p-5 glow-cyan border border-cyan-500/10">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
                      <Zap size={16} />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">AST Analysis Complete</h4>
                      <p className="text-[10px] text-zinc-500 mt-0.5">
                        Last run:{" "}
                        {data.analysis.completedAt
                          ? new Date(data.analysis.completedAt).toLocaleString()
                          : "—"}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-4">
                    {[
                      { label: "Files Parsed", value: data.analysis.filesParsed },
                      { label: "Routes", value: data.analysis.routesDetected },
                      { label: "Components", value: data.analysis.componentsDetected },
                      { label: "Interactions", value: data.analysis.interactionsDetected },
                    ].map(({ label, value }) => (
                      <div key={label} className="text-center">
                        <div className="text-base font-bold text-white">{value ?? 0}</div>
                        <div className="text-[10px] text-zinc-500 font-semibold uppercase">{label}</div>
                      </div>
                    ))}
                  </div>
                  <a
                    href="/instrumentation"
                    className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition"
                  >
                    View Instrumentation <ArrowRight size={12} />
                  </a>
                </div>
              </div>
            )}

            {/* ── Funnel & Events ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Funnel */}
              <div className="lg:col-span-2 glow-card rounded-xl p-6 glow-indigo relative overflow-hidden flex flex-col justify-between">
                <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl" />
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-white">Predicted User Funnel</h3>
                      <span className="flex items-center gap-1 text-[9px] text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full font-bold">
                        <Sparkles size={8} />
                        AI Generated
                      </span>
                    </div>
                    <span className="text-[10px] text-zinc-400 font-semibold">
                      {selectedProject?.name || "All Projects"} ▾
                    </span>
                  </div>

                  <div className="relative py-8 flex items-center justify-between gap-2 overflow-x-auto min-w-[500px]">
                    <div className="absolute top-[52px] left-[5%] right-[5%] h-1 z-0 pointer-events-none">
                      <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 10">
                        <path d="M 0 5 Q 25 8, 50 2 T 100 5" fill="none" stroke="#1f1f2e" strokeWidth="2" />
                        <path
                          d="M 0 5 Q 25 8, 50 2 T 100 5"
                          fill="none"
                          stroke="url(#indigo-grad)"
                          strokeWidth="2"
                          className="animate-flow-dash"
                        />
                        <defs>
                          <linearGradient id="indigo-grad" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor="#6366f1" />
                            <stop offset="50%" stopColor="#a855f7" />
                            <stop offset="100%" stopColor="#06b6d4" />
                          </linearGradient>
                        </defs>
                      </svg>
                    </div>
                    {funnelSteps.map((step: any, idx: number) => (
                      <div key={step.name} className="flex-1 flex flex-col items-center relative z-10">
                        <div className="relative">
                          <div className="w-12 h-12 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-300 hover:border-indigo-500 hover:text-white transition cursor-pointer shadow-lg">
                            {idx + 1}
                          </div>
                          {step.drop && (
                            <div className="absolute -left-12 top-1/2 -translate-y-1/2 flex flex-col items-center">
                              <span className="text-[9px] text-rose-500 font-bold bg-rose-500/10 px-1 rounded">
                                ↓ {step.drop}
                              </span>
                            </div>
                          )}
                        </div>
                        <span className="text-[11px] font-semibold text-zinc-300 mt-3 text-center whitespace-nowrap">
                          {step.name}
                        </span>
                        <span className="text-[12px] font-bold text-white mt-1">{step.rate}</span>
                        <span className="text-[9px] text-zinc-500 mt-0.5">{step.users} users</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-6 p-4 rounded-lg bg-zinc-950/80 border border-zinc-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-rose-500/10 text-rose-400">
                      <AlertTriangle size={16} />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white">Top Drop-off Spot</h4>
                      <p className="text-[10px] text-zinc-400">
                        Users are dropping off most between Sign Up and Login steps.
                      </p>
                    </div>
                  </div>
                  <a
                    href="/funnel-analysis"
                    className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition flex items-center gap-1 cursor-pointer"
                  >
                    View Funnel Analysis <ArrowRight size={12} />
                  </a>
                </div>
              </div>

              {/* Top Events */}
              <div className="glow-card rounded-xl p-6 glow-purple flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-white">Top Tracked Events</h3>
                    <a href="/events" className="text-xs text-indigo-400 font-semibold hover:text-indigo-300 transition">
                      View All
                    </a>
                  </div>
                  <div className="space-y-3">
                    {(
                      data?.topEvents && data.topEvents.length > 0
                        ? data.topEvents.map((e: any) => ({
                            name: e.name,
                            count: e.count,
                            cat: e.cat,
                            color:
                              e.cat === "Pageview"
                                ? "bg-indigo-500/20 text-indigo-300"
                                : e.cat === "Interaction"
                                ? "bg-purple-500/20 text-purple-300"
                                : e.cat === "System"
                                ? "bg-cyan-500/20 text-cyan-300"
                                : e.cat === "Form"
                                ? "bg-emerald-500/20 text-emerald-300"
                                : "bg-zinc-500/20 text-zinc-300",
                          }))
                        : [
                            { name: "Page Viewed", count: "—", cat: "Pageview", color: "bg-indigo-500/20 text-indigo-300" },
                            { name: "Button Clicked", count: "—", cat: "Interaction", color: "bg-purple-500/20 text-purple-300" },
                            { name: "User Logged In", count: "—", cat: "System", color: "bg-cyan-500/20 text-cyan-300" },
                            { name: "Form Submitted", count: "—", cat: "Form", color: "bg-emerald-500/20 text-emerald-300" },
                          ]
                    ).map((ev: any) => (
                      <div
                        key={ev.name}
                        className="flex items-center justify-between py-1.5 border-b border-zinc-900 last:border-0"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${ev.color}`}>{ev.cat}</span>
                          <span className="text-xs font-medium text-zinc-300">{ev.name}</span>
                        </div>
                        <span className="text-xs font-bold text-zinc-100">{ev.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Third Row ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* AI Insights */}
              <div className="glow-card rounded-xl p-6 glow-purple flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                    <Sparkles size={14} className="text-indigo-400" />
                    AI Insights
                  </h3>
                  <div className="space-y-4">
                    {insights && insights.length > 0 ? (
                      insights.slice(0, 3).map((ins, i) => (
                        <div key={i} className="space-y-1">
                          <div
                            className={`flex items-center gap-1.5 text-xs font-semibold ${
                              ins.type === "critical"
                                ? "text-rose-400"
                                : ins.type === "opportunity"
                                ? "text-indigo-400"
                                : "text-emerald-400"
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                ins.type === "critical"
                                  ? "bg-rose-500 animate-pulse"
                                  : ins.type === "opportunity"
                                  ? "bg-indigo-500"
                                  : "bg-emerald-500"
                              }`}
                            />
                            {ins.title}
                          </div>
                          <p className="text-[10px] text-zinc-400 leading-normal">
                            {ins.description}
                            {ins.recommendation && (
                              <>
                                <br />
                                <span className="text-zinc-300">Tip: {ins.recommendation}</span>
                              </>
                            )}
                          </p>
                        </div>
                      ))
                    ) : (
                      <div className="text-xs text-zinc-500">
                        No AI insights yet. Run an analysis first.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Instrumentation Status */}
              <div className="glow-card rounded-xl p-6 glow-cyan flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white mb-4">Instrumentation Status</h3>
                  <div className="flex items-center gap-6">
                    <div className="relative w-20 h-20 flex items-center justify-center shrink-0">
                      <svg className="w-full h-full transform -rotate-90">
                        <circle cx="40" cy="40" r="34" className="stroke-zinc-800" strokeWidth="6" fill="transparent" />
                        <circle
                          cx="40"
                          cy="40"
                          r="34"
                          className="stroke-cyan-500"
                          strokeWidth="6"
                          fill="transparent"
                          strokeDasharray="213"
                          strokeDashoffset={
                            data?.analysis
                              ? Math.round(213 - (213 * (data.analysis.interactionsDetected > 0 ? 92 : 0)) / 100)
                              : 213
                          }
                        />
                      </svg>
                      <div className="absolute flex flex-col items-center justify-center">
                        <span className="text-base font-extrabold text-white">
                          {data?.analysis && data.analysis.interactionsDetected > 0 ? "92%" : "0%"}
                        </span>
                        <span className="text-[8px] text-zinc-500 uppercase tracking-widest font-bold">Inst.</span>
                      </div>
                    </div>
                    <div className="flex-1 space-y-1.5">
                      {[
                        {
                          label: "Pages",
                          value:
                            Array.isArray(components) &&
                            components.some((c) => c.route && c.route !== "(component)")
                              ? "100%"
                              : data?.analysis?.routesDetected
                              ? "100%"
                              : "0%",
                        },
                        {
                          label: "Components",
                          value:
                            (data?.analysis?.componentsDetected ?? 0) > 0 ? "100%" : "0%",
                        },
                        {
                          label: "Events",
                          value:
                            (Number(data?.eventsTracked) || 0) > 0 ? "100%" : "0%",
                        },
                        {
                          label: "API Calls",
                          value: (data?.reposConnected ?? 0) > 0 ? "100%" : "0%",
                        },
                      ].map(({ label, value }) => (
                        <div key={label} className="flex items-center justify-between text-[11px]">
                          <span className="text-zinc-400">{label}</span>
                          <span className="font-semibold text-white">{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <a
                  href="/instrumentation"
                  className="w-full mt-4 bg-zinc-950/80 border border-zinc-800 hover:border-zinc-700 text-xs font-semibold py-2 rounded-lg text-zinc-300 transition text-center block"
                >
                  View Instrumentation
                </a>
              </div>

              {/* Recent Activity */}
              <div className="glow-card rounded-xl p-6 glow-indigo flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-white">Recent Activity</h3>
                  <span className="text-xs text-indigo-400 font-semibold hover:text-indigo-300 transition cursor-pointer">
                    View All
                  </span>
                </div>
                <div className="space-y-3">
                  {(
                    data?.recentActivity && data.recentActivity.length > 0
                      ? data.recentActivity.map((r: any) => ({
                          desc: r.desc,
                          time: r.time,
                          icon:
                            r.type === "code"
                              ? Code
                              : r.type === "alert"
                              ? AlertTriangle
                              : r.type === "sync"
                              ? CheckCircle2
                              : Activity,
                          color:
                            r.type === "code"
                              ? "text-cyan-400"
                              : r.type === "alert"
                              ? "text-rose-400"
                              : r.type === "sync"
                              ? "text-emerald-400"
                              : "text-indigo-400",
                        }))
                      : [
                          { desc: "No activity yet — connect a project", time: "", icon: Activity, color: "text-zinc-600" },
                        ]
                  ).map((act: any, i: number) => {
                    const Icon = act.icon;
                    return (
                      <div key={i} className="flex gap-2.5 items-start">
                        <Icon size={12} className={`mt-0.5 ${act.color}`} />
                        <div className="flex-1 flex flex-col">
                          <span className="text-[10px] text-zinc-300 leading-normal">{act.desc}</span>
                          {act.time && (
                            <span className="text-[9px] text-zinc-500 mt-0.5">{act.time}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* System Health */}
              <div className="glow-card rounded-xl p-6 glow-emerald flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-white">System Health</h3>
                    <span className="flex items-center gap-1 text-[9px] text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded">
                      ● All Systems OK
                    </span>
                  </div>
                  <div className="space-y-2">
                    {[
                      { name: "Repository Connection", val: data?.systemHealth?.repoConnection ?? 0 },
                      { name: "Event Processing", val: data?.systemHealth?.eventProcessing ?? 0 },
                      { name: "AI Analysis Engine", val: data?.systemHealth?.aiAnalysis ?? 0 },
                      { name: "Dashboard Service", val: data?.systemHealth?.dashboardService ?? 100 },
                    ].map((sys) => (
                      <div key={sys.name} className="space-y-1">
                        <div className="flex justify-between text-[9px] text-zinc-400 font-semibold">
                          <span>{sys.name}</span>
                          <span>{sys.val}%</span>
                        </div>
                        <div className="h-1 bg-zinc-900 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${
                              sys.val === 100
                                ? "bg-emerald-500"
                                : sys.val > 0
                                ? "bg-cyan-500"
                                : "bg-rose-500"
                            }`}
                            style={{ width: `${sys.val}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="h-6 mt-4 opacity-50">
                  <svg className="w-full h-full" viewBox="0 0 100 20" preserveAspectRatio="none">
                    <path
                      d="M 0 10 L 20 8 L 40 12 L 60 7 L 80 15 L 100 3"
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="1.5"
                    />
                  </svg>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Close dropdowns on backdrop click */}
      {(showProjectDropdown || showRangeDropdown) && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => {
            setShowProjectDropdown(false);
            setShowRangeDropdown(false);
          }}
        />
      )}
    </DashboardLayout>
  );
}
