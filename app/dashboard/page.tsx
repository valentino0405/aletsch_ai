"use client";

import { useUser } from "@clerk/nextjs";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/navigation/DashboardLayout";
import {
  Users as UsersIcon,
  Activity,
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

interface TrendDelta {
  percent: number | null;
  direction: "up" | "down" | "flat";
  label: string;
}

interface HealthSignal {
  // "off" is distinct from "idle": idle means the subsystem works but
  // has nothing to do yet, off means it was never configured.
  state: "ok" | "idle" | "degraded" | "off";
  detail: string;
}

interface TopEvent {
  name: string;
  count: string;
  cat: string;
}

interface ActivityEntry {
  desc: string;
  time: string;
  type: string;
  status?: string;
}

interface FunnelStep {
  name: string;
  event: string;
  users: number;
  percent: number;
  drop: number;
  dropFromPrevious: number;
}

interface DashboardData {
  range?: { key: string; label: string; days: number };
  storage?: string;
  totalUsers: string | number;
  eventsTracked: string | number;
  componentsDetected: number;
  reposConnected: number;
  conversionRate: string;
  averageSessionTime: string;
  atRiskDropoffs: number;
  funnel: FunnelStep[];
  funnelMeta?: {
    name: string | null;
    source: string | null;
    largestDropoff: { from: string; to: string; rate: number } | null;
    insufficientData: boolean;
  };
  trends?: {
    window: string;
    hasData: boolean;
    series: { date: string; events: number; users: number }[];
    eventSparkline: number[];
    userSparkline: number[];
    users: TrendDelta;
    events: TrendDelta;
  };
  topEvents: TopEvent[];
  recentActivity: ActivityEntry[];
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
    repoConnection: HealthSignal;
    eventProcessing: HealthSignal;
    aiAnalysis: HealthSignal;
    codeAnalysis?: HealthSignal;
    dashboardService: HealthSignal;
  };
}

/** The ranges /api/dashboard accepts. The key is sent; the label is shown. */
const DATE_RANGES: { key: string; label: string }[] = [
  { key: "1d", label: "Today" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
];

/** Matches the tone used on the Projects, Repositories and analytics pages. */
function statusStyle(status: string): string {
  const value = (status || "").toLowerCase();
  if (value === "ready" || value === "synced" || value === "connected") {
    return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
  }
  if (value === "analyzing" || value === "syncing" || value === "queued" || value === "running") {
    return "text-indigo-300 bg-indigo-500/10 border-indigo-500/20";
  }
  if (value === "error" || value === "failed") return "text-rose-300 bg-rose-500/10 border-rose-500/20";
  return "text-zinc-400 bg-zinc-800/60 border-zinc-800";
}

/** "owner/repo" from a GitHub URL, falling back to the URL without its scheme. */
function repositoryLabel(url?: string): string {
  if (!url) return "No repository";
  const match = url.match(/github\.com[/:]([^/]+\/[^/.]+)/i);
  return match ? match[1] : url.replace(/^https?:\/\//, "");
}

/** Tone for a subsystem signal. "idle" is not a failure — it means no work yet. */
const HEALTH_TONE: Record<string, { dot: string; text: string }> = {
  ok: { dot: "bg-emerald-400", text: "text-emerald-400" },
  idle: { dot: "bg-zinc-600", text: "text-zinc-500" },
  degraded: { dot: "bg-amber-400", text: "text-amber-400" },
  off: { dot: "bg-zinc-700", text: "text-zinc-600" },
};

export default function Dashboard() {
  const { user, isLoaded } = useUser();
  // Holds the range *key* ("7d"), which is what the API accepts. This used to
  // hold a display label that was never sent anywhere, so changing the range
  // relabelled the button without changing a single number on the page.
  const [rangeKey, setRangeKey] = useState("7d");
  const [showRangeDropdown, setShowRangeDropdown] = useState(false);
  const [data, setData] = useState<DashboardData | null>(null);
  const [insights, setInsights] = useState<any[]>([]);
  const [components, setComponents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);

  // Fetch all data for the selected project
  const fetchAll = useCallback(
    async (projectId?: string, range?: string) => {
      setLoading(true);
      setLoadError("");
      try {
        const pid = projectId ?? selectedProjectId;
        const activeRange = range ?? rangeKey;
        const query = new URLSearchParams({ range: activeRange });
        if (pid) query.set("projectId", pid);
        const scoped = pid ? `?projectId=${encodeURIComponent(pid)}` : "";

        const [dashRes, insightsRes, compRes] = await Promise.all([
          fetch(`/api/dashboard?${query.toString()}`),
          fetch(`/api/insights${scoped}`),
          fetch(`/api/instrumentation${scoped}`),
        ]);

        if (dashRes.ok) {
          const dashData = await dashRes.json();
          setData(dashData);
          // Bootstrap project list from first response
          if (dashData.projects?.length > 0) {
            setProjects(dashData.projects);
            if (!pid && dashData.projects[0]) {
              setSelectedProjectId(dashData.projects[0].id);
            }
          }
        } else {
          const problem = await dashRes.json().catch(() => ({}));
          setLoadError(problem.error || "Dashboard data could not be loaded.");
        }
        if (insightsRes.ok) setInsights(await insightsRes.json());
        if (compRes.ok) {
          const compData = await compRes.json();
          setComponents(Array.isArray(compData) ? compData : compData.components || []);
        }
      } catch (err) {
        console.error("Failed to load dashboard:", err);
        setLoadError("Could not reach the dashboard service.");
      } finally {
        setLoading(false);
      }
    },
    [selectedProjectId, rangeKey]
  );

  // Initial load. fetchAll is stable for the empty selection it reads here;
  // later loads are driven explicitly by the project and range handlers.
  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch when project changes
  const handleProjectSelect = (proj: ProjectMeta) => {
    setSelectedProjectId(proj.id);
    setShowProjectDropdown(false);
    fetchAll(proj.id);
  };

  // Re-fetch when the range changes, so the label and the numbers agree.
  const handleRangeSelect = (key: string) => {
    setRangeKey(key);
    setShowRangeDropdown(false);
    fetchAll(undefined, key);
  };

  const rangeLabel =
    DATE_RANGES.find((entry) => entry.key === rangeKey)?.label ?? "Last 7 days";

  const selectedProject = projects.find((p) => p.id === selectedProjectId) || data?.selectedProject || null;

  // Trend labels and sparklines come from /api/dashboard, which measures the
  // selected range against the equally-long window before it. Nothing here is
  // illustrative: with no events the series is flat and the label says so.
  const trends = data?.trends;
  const rangeDays = data?.range?.days ?? 7;
  const flatSeries = Array.from({ length: rangeDays }, () => 0);
  const userSpark = trends?.userSparkline?.length ? trends.userSparkline : flatSeries;
  const eventSpark = trends?.eventSparkline?.length ? trends.eventSparkline : flatSeries;

  // `change` is only paired with a trend arrow when a delta was actually
  // measured. The other three cards carry a plain caption instead — an
  // upward arrow next to "Auto-detected" would imply a rise nobody computed.
  const metrics = [
    {
      title: "Total Users",
      value: String(data?.totalUsers ?? "0"),
      change: trends?.users.label ?? "No prior data",
      direction: trends?.users.direction ?? null,
      icon: UsersIcon,
      colorClass: "text-indigo-400",
      bgClass: "bg-indigo-500/10",
      glowClass: "glow-indigo",
      sparkline: userSpark,
    },
    {
      title: "Events Tracked",
      value: String(data?.eventsTracked ?? "0"),
      change: trends?.events.label ?? "No prior data",
      direction: trends?.events.direction ?? null,
      icon: Activity,
      colorClass: "text-purple-400",
      bgClass: "bg-purple-500/10",
      glowClass: "glow-purple",
      sparkline: eventSpark,
    },
    {
      title: "Repos Connected",
      value: String(data?.reposConnected ?? "0"),
      change: `${data?.reposConnected ?? 0} active`,
      direction: null,
      icon: GitBranch,
      colorClass: "text-cyan-400",
      bgClass: "bg-cyan-500/10",
      glowClass: "glow-cyan",
      sparkline: flatSeries.map(() => data?.reposConnected ?? 0),
    },
    {
      title: "Interactions",
      value: String(data?.analysis?.interactionsDetected ?? data?.componentsDetected ?? "0"),
      change: "Auto-detected",
      direction: null,
      icon: MousePointerClick,
      colorClass: "text-emerald-400",
      bgClass: "bg-emerald-500/10",
      glowClass: "glow-emerald",
      sparkline: flatSeries.map(() => data?.componentsDetected ?? 0),
    },
    {
      title: "At Risk Drop-offs",
      value: String(data?.atRiskDropoffs ?? "0"),
      change:
        data?.funnelMeta?.largestDropoff
          ? `Worst: ${data.funnelMeta.largestDropoff.rate.toFixed(1)}%`
          : "None measured",
      direction: null,
      icon: AlertTriangle,
      colorClass: "text-rose-400",
      bgClass: "bg-rose-500/10",
      glowClass: "glow-rose",
      sparkline: flatSeries.map(() => data?.atRiskDropoffs ?? 0),
    },
  ];

  // Real instrumentation coverage. A component counts as instrumented
  // only when an applied plan covers its file — see /api/instrumentation.
  const detectedComponents = Array.isArray(components) ? components : [];
  const instrumentedComponents = detectedComponents.filter((c) => c.instrumented);
  const pendingComponents = detectedComponents.filter((c) => c.status === "Pending review");
  const instrumentationPct =
    detectedComponents.length > 0
      ? Math.round((instrumentedComponents.length / detectedComponents.length) * 100)
      : 0;
  const liveEventCount = instrumentedComponents.reduce(
    (total, c) => total + (c.events?.length || 0),
    0
  );
  const proposedEventCount = detectedComponents.reduce(
    (total, c) => total + (c.eventsAreLive ? 0 : c.events?.length || 0),
    0
  );

  // Real funnel only. With no events there is no funnel to draw, and the
  // panel renders an empty state instead of a placeholder journey.
  const funnelSteps = data?.funnel ?? [];
  const hasFunnel = funnelSteps.length > 0 && !data?.funnelMeta?.insufficientData;

  const EVENT_CATEGORY_COLOR: Record<string, string> = {
    Pageview: "bg-indigo-500/20 text-indigo-300",
    Interaction: "bg-purple-500/20 text-purple-300",
    System: "bg-cyan-500/20 text-cyan-300",
    Form: "bg-emerald-500/20 text-emerald-300",
  };
  const topEvents = (data?.topEvents ?? []).map((event) => ({
    name: event.name,
    count: event.count,
    cat: event.cat,
    color: EVENT_CATEGORY_COLOR[event.cat] ?? "bg-zinc-500/20 text-zinc-300",
  }));

  const IDLE_SIGNAL: HealthSignal = { state: "idle", detail: "Not reported" };
  const healthRows = [
    { name: "Repository Connection", signal: data?.systemHealth?.repoConnection ?? IDLE_SIGNAL },
    { name: "Event Processing", signal: data?.systemHealth?.eventProcessing ?? IDLE_SIGNAL },
    // The AST parser and the LLM are separate subsystems that fail
    // independently — one row for both hid a dead model behind a
    // healthy parser.
    { name: "Code Analysis (AST)", signal: data?.systemHealth?.codeAnalysis ?? IDLE_SIGNAL },
    { name: "AI Model", signal: data?.systemHealth?.aiAnalysis ?? IDLE_SIGNAL },
    { name: "Dashboard Service", signal: data?.systemHealth?.dashboardService ?? IDLE_SIGNAL },
  ];
  // The summary badge reflects the rows beneath it. "All systems OK" is only
  // claimed when every subsystem actually reports ok.
  const healthSummary = healthRows.some((row) => row.signal.state === "degraded")
    ? { tone: "degraded", label: "Degraded" }
    : healthRows.every((row) => row.signal.state === "ok")
    ? { tone: "ok", label: "All Systems OK" }
    : { tone: "idle", label: "Awaiting data" };

  const ACTIVITY_ICON: Record<string, typeof Activity> = {
    code: Code,
    alert: AlertTriangle,
    sync: CheckCircle2,
  };
  const ACTIVITY_COLOR: Record<string, string> = {
    code: "text-cyan-400",
    alert: "text-rose-400",
    sync: "text-emerald-400",
  };
  const recentActivity = (data?.recentActivity ?? []).map((entry) => ({
    desc: entry.desc,
    time: entry.time,
    icon: ACTIVITY_ICON[entry.type] ?? Activity,
    color: ACTIVITY_COLOR[entry.type] ?? "text-indigo-400",
  }));

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
                      <Link href="/projects" className="text-indigo-400 hover:underline">
                        Add one
                      </Link>
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
                              proj.status === "Ready"
                                ? "bg-emerald-400"
                                : proj.status === "Analyzing"
                                ? "bg-indigo-400 animate-pulse"
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
                        <Link
                          href="/projects"
                          className="w-full text-left px-3 py-2 rounded-lg text-xs text-indigo-400 hover:bg-zinc-900 hover:text-indigo-300 transition flex items-center gap-2"
                        >
                          <Zap size={11} />
                          Manage Projects
                        </Link>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Date range picker. Only the ranges /api/dashboard can actually
                measure are offered — a "Custom range" option used to sit here
                with nothing behind it. */}
            <div className="relative">
              <button
                onClick={() => setShowRangeDropdown(!showRangeDropdown)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-zinc-800/80 bg-zinc-950/40 text-xs font-semibold text-zinc-300 hover:text-white transition cursor-pointer"
              >
                <Calendar size={13} className="text-indigo-400" />
                <span>{rangeLabel}</span>
                <ChevronDown
                  size={13}
                  className={`text-zinc-500 transition-transform ${showRangeDropdown ? "rotate-180" : ""}`}
                />
              </button>
              {showRangeDropdown && (
                <div className="absolute right-0 mt-2 w-48 rounded-lg border border-zinc-800 bg-zinc-950 shadow-2xl p-1 z-50">
                  {DATE_RANGES.map((range) => (
                    <button
                      key={range.key}
                      onClick={() => handleRangeSelect(range.key)}
                      className={`w-full text-left px-3 py-2 rounded-md text-xs transition flex items-center gap-2 cursor-pointer ${
                        rangeKey === range.key
                          ? "bg-indigo-600/15 text-indigo-300"
                          : "hover:bg-zinc-900 text-zinc-300 hover:text-white"
                      }`}
                    >
                      <span className="truncate">{range.label}</span>
                      {rangeKey === range.key && (
                        <CheckCircle2 size={11} className="text-indigo-400 ml-auto shrink-0" />
                      )}
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
              {repositoryLabel(selectedProject.repositoryUrl)}
            </span>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusStyle(
                selectedProject.status || ""
              )}`}
            >
              {selectedProject.status || "Connected"}
            </span>
          </div>
        )}

        {loadError && (
          <div className="flex items-center gap-2 rounded-lg border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-xs text-rose-300">
            <AlertTriangle size={13} className="shrink-0" />
            {loadError}
          </div>
        )}

        {data?.storage === "in-memory" && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-300">
            <AlertTriangle size={13} className="shrink-0" />
            No database is configured, so this workspace is held in memory and will be lost when the
            server restarts.
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
            <Link
              href="/projects"
              className="inline-flex items-center gap-1.5 bg-accent hover:bg-accent-hover text-on-accent px-4 py-2 rounded-lg text-xs font-semibold transition"
            >
              <Zap size={12} />
              Connect Your First Project
            </Link>
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
                        {metric.direction === "up" && (
                          <TrendingUp size={12} className="text-emerald-400" />
                        )}
                        {metric.direction === "down" && (
                          <TrendingDown size={12} className="text-rose-400" />
                        )}
                        <span
                          className={`text-[10px] font-semibold ${
                            metric.direction === "up"
                              ? "text-emerald-400"
                              : metric.direction === "down"
                              ? "text-rose-400"
                              : "text-zinc-500"
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
                  <Link
                    href="/instrumentation"
                    className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition"
                  >
                    View Instrumentation <ArrowRight size={12} />
                  </Link>
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
                      <h3 className="text-sm font-bold text-white">
                        {data?.funnelMeta?.name || "User Funnel"}
                      </h3>
                      {/* How the steps were chosen — a saved funnel is the
                          developer's own, the others were derived from
                          observed events. Never labelled "AI generated"
                          unless the AI actually named the stages. */}
                      {hasFunnel && (
                        <span
                          className={`flex items-center gap-1 text-[9px] px-2 py-0.5 rounded-full font-bold ${
                            data?.funnelMeta?.source === "saved"
                              ? "text-emerald-400 bg-emerald-500/10"
                              : data?.funnelMeta?.source === "derived-from-catalog"
                              ? "text-indigo-400 bg-indigo-500/10"
                              : "text-zinc-400 bg-zinc-500/10"
                          }`}
                        >
                          {data?.funnelMeta?.source === "saved" ? (
                            <CheckCircle2 size={8} />
                          ) : (
                            <Sparkles size={8} />
                          )}
                          {data?.funnelMeta?.source === "saved"
                            ? "Saved definition"
                            : data?.funnelMeta?.source === "derived-from-catalog"
                            ? "Derived from AI event stages"
                            : "Derived from observed events"}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-zinc-400 font-semibold">
                      {selectedProject?.name || "All Projects"}
                    </span>
                  </div>

                  {!hasFunnel ? (
                    <div className="py-12 text-center space-y-2">
                      <BarChart3 size={28} className="mx-auto text-indigo-500/30" />
                      <p className="text-xs font-semibold text-zinc-300">
                        Insufficient data to determine a funnel
                      </p>
                      <p className="text-[11px] text-zinc-500 max-w-sm mx-auto leading-relaxed">
                        A funnel is built from events this project has actually emitted. Apply an
                        instrumentation plan, then collect traffic — Aletsch will not show a placeholder
                        journey in the meantime.
                      </p>
                      <Link
                        href="/instrumentation"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition pt-1"
                      >
                        Go to instrumentation <ArrowRight size={12} />
                      </Link>
                    </div>
                  ) : (
                    <div className="relative py-8 flex items-center justify-between gap-2 overflow-x-auto min-w-[500px]">
                      <div className="absolute top-[52px] left-[5%] right-[5%] h-1 z-0 pointer-events-none">
                        <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 10">
                          <path d="M 0 5 Q 25 8, 50 2 T 100 5" fill="none" stroke="var(--color-line)" strokeWidth="2" />
                          <path
                            d="M 0 5 Q 25 8, 50 2 T 100 5"
                            fill="none"
                            stroke="url(#indigo-grad)"
                            strokeWidth="2"
                            className="animate-flow-dash"
                          />
                          <defs>
                            <linearGradient id="indigo-grad" x1="0" y1="0" x2="1" y2="0">
                              <stop offset="0%" stopColor="var(--color-accent)" />
                              <stop offset="50%" stopColor="var(--color-secondary)" />
                              <stop offset="100%" stopColor="var(--color-cyan-500)" />
                            </linearGradient>
                          </defs>
                        </svg>
                      </div>
                      {funnelSteps.map((step, idx: number) => (
                        <div key={step.name} className="flex-1 flex flex-col items-center relative z-10">
                          <div className="relative">
                            <div className="w-12 h-12 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-300 hover:border-indigo-500 hover:text-white transition cursor-pointer shadow-lg">
                              {idx + 1}
                            </div>
                            {step.dropFromPrevious > 0 && (
                              <div className="absolute -left-12 top-1/2 -translate-y-1/2 flex flex-col items-center">
                                <span className="text-[9px] text-rose-500 font-bold bg-rose-500/10 px-1 rounded">
                                  ↓ {step.dropFromPrevious}%
                                </span>
                              </div>
                            )}
                          </div>
                          <span className="text-[11px] font-semibold text-zinc-300 mt-3 text-center whitespace-nowrap">
                            {step.name}
                          </span>
                          <span className="text-[12px] font-bold text-white mt-1">{step.percent}%</span>
                          <span className="text-[9px] text-zinc-500 mt-0.5">
                            {step.users} user{step.users === 1 ? "" : "s"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-6 p-4 rounded-lg bg-zinc-950/80 border border-zinc-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2 rounded-lg ${
                        data?.funnelMeta?.largestDropoff
                          ? "bg-rose-500/10 text-rose-400"
                          : "bg-zinc-500/10 text-zinc-400"
                      }`}
                    >
                      <AlertTriangle size={16} />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white">Top Drop-off Spot</h4>
                      <p className="text-[10px] text-zinc-400">
                        {data?.funnelMeta?.largestDropoff
                          ? `${data.funnelMeta.largestDropoff.rate.toFixed(1)}% of users who reached ${data.funnelMeta.largestDropoff.from} did not continue to ${data.funnelMeta.largestDropoff.to}.`
                          : "No drop-off measured yet."}
                      </p>
                    </div>
                  </div>
                  <Link
                    href="/funnel-analysis"
                    className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition flex items-center gap-1 cursor-pointer"
                  >
                    View Funnel Analysis <ArrowRight size={12} />
                  </Link>
                </div>
              </div>

              {/* Top Events */}
              <div className="glow-card rounded-xl p-6 glow-purple flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-white">Top Tracked Events</h3>
                    <Link
                      href="/events"
                      className="text-xs text-indigo-400 font-semibold hover:text-indigo-300 transition"
                    >
                      View All
                    </Link>
                  </div>
                  {/* Only events this workspace has actually recorded. This panel
                      used to fall back to a catalogue of plausible-looking names
                      — Page Viewed, Button Clicked, User Logged In — which read
                      as real events with a dash for a count. */}
                  {topEvents.length === 0 ? (
                    <div className="py-8 text-center space-y-2">
                      <Activity size={24} className="mx-auto text-purple-500/30" />
                      <p className="text-xs font-semibold text-zinc-300">No events recorded yet</p>
                      <p className="text-[11px] text-zinc-500 leading-relaxed">
                        Event names appear here once your instrumented application sends its first
                        events to the ingest endpoint.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {topEvents.map((ev) => (
                        <div
                          key={ev.name}
                          className="flex items-center justify-between py-1.5 border-b border-zinc-900 last:border-0"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono shrink-0 ${ev.color}`}>
                              {ev.cat}
                            </span>
                            <span className="text-xs font-medium text-zinc-300 truncate" title={ev.name}>
                              {ev.name}
                            </span>
                          </div>
                          <span className="text-xs font-bold text-zinc-100 shrink-0">{ev.count}</span>
                        </div>
                      ))}
                    </div>
                  )}
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
                          strokeDashoffset={Math.round(213 - (213 * instrumentationPct) / 100)}
                        />
                      </svg>
                      <div className="absolute flex flex-col items-center justify-center">
                        <span className="text-base font-extrabold text-white">
                          {instrumentationPct}%
                        </span>
                        <span className="text-[8px] text-zinc-500 uppercase tracking-widest font-bold">Inst.</span>
                      </div>
                    </div>
                    <div className="flex-1 space-y-1.5">
                      {[
                        {
                          label: "Components detected",
                          value: String(detectedComponents.length),
                        },
                        {
                          label: "Instrumented",
                          value: String(instrumentedComponents.length),
                        },
                        {
                          label: "Pending review",
                          value: String(pendingComponents.length),
                        },
                        {
                          label: "Events instrumented",
                          value:
                            liveEventCount > 0
                              ? String(liveEventCount)
                              : `0 (${proposedEventCount} proposed)`,
                        },
                        {
                          // "Events live" used to show the instrumented
                          // count, which reads as received telemetry and
                          // contradicted the Events Explorer showing 0.
                          // These are two different claims; show both.
                          label: "Events received",
                          value: String(data?.eventsTracked ?? 0),
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
                <Link
                  href="/instrumentation"
                  className="w-full mt-4 bg-zinc-950/80 border border-zinc-800 hover:border-zinc-700 text-xs font-semibold py-2 rounded-lg text-zinc-300 transition text-center block"
                >
                  View Instrumentation
                </Link>
              </div>

              {/* Recent Activity */}
              <div className="glow-card rounded-xl p-6 glow-indigo flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-white">Recent Activity</h3>
                  {/* This was a <span> styled as a link with no handler at all. */}
                  <Link
                    href="/events"
                    className="text-xs text-indigo-400 font-semibold hover:text-indigo-300 transition"
                  >
                    View All
                  </Link>
                </div>
                <div className="space-y-3">
                  {recentActivity.length === 0 ? (
                    <div className="flex gap-2.5 items-start">
                      <Activity size={12} className="mt-0.5 text-zinc-600" />
                      <span className="text-[10px] text-zinc-500 leading-normal">
                        No activity yet. Analysis runs and incoming events will appear here.
                      </span>
                    </div>
                  ) : (
                    recentActivity.map((act, i) => {
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
                    })
                  )}
                </div>
              </div>

              {/* System Health. Each row is a subsystem state backed by a count
                  the API actually made, not a percentage. The header badge
                  used to read "● All Systems OK" unconditionally — it said so
                  even while every bar below it was empty. */}
              <div className="glow-card rounded-xl p-6 glow-emerald flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-white">System Health</h3>
                    <span
                      className={`flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded ${
                        healthSummary.tone === "ok"
                          ? "text-emerald-400 bg-emerald-500/10"
                          : healthSummary.tone === "degraded"
                          ? "text-amber-400 bg-amber-500/10"
                          : "text-zinc-400 bg-zinc-500/10"
                      }`}
                    >
                      ● {healthSummary.label}
                    </span>
                  </div>
                  <div className="space-y-2.5">
                    {healthRows.map((row) => {
                      const tone = HEALTH_TONE[row.signal.state] ?? HEALTH_TONE.idle;
                      return (
                        <div key={row.name} className="space-y-0.5">
                          <div className="flex items-center justify-between text-[10px] font-semibold">
                            <span className="text-zinc-300">{row.name}</span>
                            <span className={`flex items-center gap-1 ${tone.text}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} />
                              {row.signal.state === "ok"
                                ? "Operational"
                                : row.signal.state === "degraded"
                                ? "Degraded"
                                : row.signal.state === "off"
                                ? "Not configured"
                                : "Idle"}
                            </span>
                          </div>
                          <p className="text-[9px] text-zinc-500 leading-normal">{row.signal.detail}</p>
                        </div>
                      );
                    })}
                  </div>
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
