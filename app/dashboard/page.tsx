"use client";

import { useUser } from "@clerk/nextjs";
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/navigation/DashboardLayout";
import { motion, AnimatePresence, useInView, useMotionValue, useSpring } from "framer-motion";
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
  RefreshCw,
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

const DATE_RANGES: { key: string; label: string }[] = [
  { key: "1d", label: "Today" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
];

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

function repositoryLabel(url?: string): string {
  if (!url) return "No repository";
  const match = url.match(/github\.com[/:]([^/]+\/[^/.]+)/i);
  return match ? match[1] : url.replace(/^https?:\/\//, "");
}

const HEALTH_TONE: Record<string, { dot: string; text: string }> = {
  ok: { dot: "bg-emerald-400", text: "text-emerald-400" },
  idle: { dot: "bg-zinc-600", text: "text-zinc-500" },
  degraded: { dot: "bg-amber-400", text: "text-amber-400" },
  off: { dot: "bg-zinc-700", text: "text-zinc-600" },
};

// ── Animated number counter ──────────────────────────────────────
function AnimatedNumber({ value }: { value: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const motionVal = useMotionValue(0);
  const spring = useSpring(motionVal, { stiffness: 80, damping: 18 });
  const [display, setDisplay] = useState("0");

  // If value is numeric, animate to it; otherwise just show the string
  const numericVal = parseFloat(value.replace(/,/g, ""));
  const isNumeric = !isNaN(numericVal);

  useEffect(() => {
    if (inView && isNumeric) {
      motionVal.set(numericVal);
    }
  }, [inView, isNumeric, numericVal, motionVal]);

  useEffect(() => {
    return spring.on("change", (v) => {
      const rounded = Math.round(v);
      setDisplay(rounded >= 1000 ? rounded.toLocaleString() : String(rounded));
    });
  }, [spring]);

  if (!isNumeric) return <span ref={ref}>{value}</span>;
  return <span ref={ref}>{inView ? display : "0"}</span>;
}

// ── Spotlight card (cursor glow effect) ──────────────────────────
function SpotlightCard({
  children,
  className = "",
  glowColor = "rgba(99,102,241,0.12)",
}: {
  children: React.ReactNode;
  className?: string;
  glowColor?: string;
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [hovered, setHovered] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = divRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  return (
    <div
      ref={divRef}
      className={`glow-card rounded-xl relative overflow-hidden ${className}`}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {hovered && (
        <div
          className="pointer-events-none absolute inset-0 rounded-xl transition-opacity duration-300"
          style={{
            background: `radial-gradient(350px circle at ${pos.x}px ${pos.y}px, ${glowColor}, transparent 70%)`,
          }}
        />
      )}
      {children}
    </div>
  );
}

// ── Skeleton loader ──────────────────────────────────────────────
function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div className={`glow-card rounded-xl p-5 shimmer ${className}`}>
      <div className="h-3 w-1/3 rounded bg-zinc-800/80 mb-4" />
      <div className="h-7 w-1/2 rounded bg-zinc-800/60 mb-2" />
      <div className="h-2 w-2/3 rounded bg-zinc-800/40" />
    </div>
  );
}

// ── Main container animation variants ───────────────────────────
const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 22 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" as const } },
};

// ── Dashboard Component ──────────────────────────────────────────
export default function Dashboard() {
  const { user, isLoaded } = useUser();
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
  const [refreshKey, setRefreshKey] = useState(0);

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

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const handleProjectSelect = (proj: ProjectMeta) => {
    setSelectedProjectId(proj.id);
    setShowProjectDropdown(false);
    fetchAll(proj.id);
  };

  const handleRangeSelect = (key: string) => {
    setRangeKey(key);
    setShowRangeDropdown(false);
    fetchAll(undefined, key);
  };

  const rangeLabel = DATE_RANGES.find((entry) => entry.key === rangeKey)?.label ?? "Last 7 days";
  const selectedProject = projects.find((p) => p.id === selectedProjectId) || data?.selectedProject || null;

  const trends = data?.trends;
  const rangeDays = data?.range?.days ?? 7;
  const flatSeries = Array.from({ length: rangeDays }, () => 0);
  const userSpark = trends?.userSparkline?.length ? trends.userSparkline : flatSeries;
  const eventSpark = trends?.eventSparkline?.length ? trends.eventSparkline : flatSeries;

  const metrics = [
    {
      title: "Total Users",
      value: String(data?.totalUsers ?? "0"),
      change: trends?.users.label ?? "No prior data",
      direction: trends?.users.direction ?? null,
      icon: UsersIcon,
      colorClass: "text-indigo-400",
      bgClass: "bg-indigo-500/10",
      glowColor: "rgba(99,102,241,0.15)",
      sparkline: userSpark,
      accent: "#6366f1",
    },
    {
      title: "Events Tracked",
      value: String(data?.eventsTracked ?? "0"),
      change: trends?.events.label ?? "No prior data",
      direction: trends?.events.direction ?? null,
      icon: Activity,
      colorClass: "text-purple-400",
      bgClass: "bg-purple-500/10",
      glowColor: "rgba(168,85,247,0.15)",
      sparkline: eventSpark,
      accent: "#a855f7",
    },
    {
      title: "Repos Connected",
      value: String(data?.reposConnected ?? "0"),
      change: `${data?.reposConnected ?? 0} active`,
      direction: null,
      icon: GitBranch,
      colorClass: "text-cyan-400",
      bgClass: "bg-cyan-500/10",
      glowColor: "rgba(6,182,212,0.15)",
      sparkline: flatSeries.map(() => data?.reposConnected ?? 0),
      accent: "#06b6d4",
    },
    {
      title: "Interactions",
      value: String(data?.analysis?.interactionsDetected ?? data?.componentsDetected ?? "0"),
      change: "Auto-detected",
      direction: null,
      icon: MousePointerClick,
      colorClass: "text-emerald-400",
      bgClass: "bg-emerald-500/10",
      glowColor: "rgba(16,185,129,0.15)",
      sparkline: flatSeries.map(() => data?.componentsDetected ?? 0),
      accent: "#10b981",
    },
    {
      title: "At Risk Drop-offs",
      value: String(data?.atRiskDropoffs ?? "0"),
      change: data?.funnelMeta?.largestDropoff
        ? `Worst: ${data.funnelMeta.largestDropoff.rate.toFixed(1)}%`
        : "None measured",
      direction: null,
      icon: AlertTriangle,
      colorClass: "text-rose-400",
      bgClass: "bg-rose-500/10",
      glowColor: "rgba(244,63,94,0.15)",
      sparkline: flatSeries.map(() => data?.atRiskDropoffs ?? 0),
      accent: "#f43f5e",
    },
  ];

  const detectedComponents = Array.isArray(components) ? components : [];
  const instrumentedComponents = detectedComponents.filter((c) => c.instrumented);
  const pendingComponents = detectedComponents.filter((c) => c.status === "Pending review");
  const instrumentationPct =
    detectedComponents.length > 0
      ? Math.round((instrumentedComponents.length / detectedComponents.length) * 100)
      : 0;
  const liveEventCount = instrumentedComponents.reduce((total, c) => total + (c.events?.length || 0), 0);
  const proposedEventCount = detectedComponents.reduce(
    (total, c) => total + (c.eventsAreLive ? 0 : c.events?.length || 0),
    0
  );

  const funnelSteps = data?.funnel ?? [];
  const hasFunnel = funnelSteps.length > 0 && !data?.funnelMeta?.insufficientData;

  const EVENT_CATEGORY_COLOR: Record<string, string> = {
    Pageview: "bg-indigo-500/20 text-indigo-300 border border-indigo-500/20",
    Interaction: "bg-purple-500/20 text-purple-300 border border-purple-500/20",
    System: "bg-cyan-500/20 text-cyan-300 border border-cyan-500/20",
    Form: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/20",
  };
  const topEvents = (data?.topEvents ?? []).map((event) => ({
    name: event.name,
    count: event.count,
    cat: event.cat,
    color: EVENT_CATEGORY_COLOR[event.cat] ?? "bg-zinc-500/20 text-zinc-300 border border-zinc-500/20",
  }));

  const IDLE_SIGNAL: HealthSignal = { state: "idle", detail: "Not reported" };
  const healthRows = [
    { name: "Repository Connection", signal: data?.systemHealth?.repoConnection ?? IDLE_SIGNAL },
    { name: "Event Processing", signal: data?.systemHealth?.eventProcessing ?? IDLE_SIGNAL },
    { name: "Code Analysis (AST)", signal: data?.systemHealth?.codeAnalysis ?? IDLE_SIGNAL },
    { name: "AI Model", signal: data?.systemHealth?.aiAnalysis ?? IDLE_SIGNAL },
    { name: "Dashboard Service", signal: data?.systemHealth?.dashboardService ?? IDLE_SIGNAL },
  ];
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

  const greetingHour = new Date().getHours();
  const greeting = greetingHour < 12 ? "Good morning" : greetingHour < 18 ? "Good afternoon" : "Good evening";

  return (
    <DashboardLayout>
      {/* ── Ambient background mesh ── */}
      <div className="ambient-bg" />

      <div className="relative z-10 space-y-8">

        {/* ── Header ── */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col md:flex-row md:items-center justify-between gap-4"
        >
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <span className="gradient-text">
                {greeting},{" "}
                {isLoaded && user ? user.firstName : "Developer"}
              </span>
              <motion.span
                animate={{ rotate: [0, 14, -8, 14, 0] }}
                transition={{ duration: 1.6, delay: 0.8, ease: "easeInOut" }}
                className="inline-block"
              >
                👋
              </motion.span>
            </h1>
            <p className="text-sm text-zinc-500 mt-1">
              Here&apos;s your project analytics at a glance.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Refresh button */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setRefreshKey((k) => k + 1)}
              className="p-2 rounded-lg border border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:text-white hover:border-zinc-700 transition"
              title="Refresh"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </motion.button>

            {/* Project Selector */}
            <div className="relative">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                id="project-selector-btn"
                onClick={() => setShowProjectDropdown(!showProjectDropdown)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-700/60 bg-zinc-900/80 backdrop-blur-sm text-xs font-semibold text-zinc-200 hover:border-indigo-500/50 hover:text-white transition min-w-[180px] justify-between shadow-lg"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FolderOpen size={13} className="text-indigo-400 shrink-0" />
                  <span className="truncate">
                    {loading && !selectedProject
                      ? "Loading..."
                      : selectedProject?.name || "Select Project"}
                  </span>
                </div>
                <motion.div
                  animate={{ rotate: showProjectDropdown ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronDown size={13} className="text-zinc-500 shrink-0" />
                </motion.div>
              </motion.button>

              <AnimatePresence>
                {showProjectDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.95 }}
                    transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                    className="absolute right-0 mt-2 w-56 rounded-xl border border-zinc-800 bg-zinc-950/95 backdrop-blur-xl shadow-2xl p-1 z-50"
                  >
                    {projects.length === 0 ? (
                      <div className="px-3 py-4 text-center text-xs text-zinc-500">
                        No projects yet.{" "}
                        <Link href="/projects" className="text-indigo-400 hover:underline">
                          Add one
                        </Link>
                      </div>
                    ) : (
                      <>
                        {projects.map((proj, i) => (
                          <motion.button
                            key={proj.id}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.04 }}
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
                          </motion.button>
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
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Date range picker */}
            <div className="relative">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setShowRangeDropdown(!showRangeDropdown)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-800/80 bg-zinc-950/60 backdrop-blur-sm text-xs font-semibold text-zinc-300 hover:text-white transition shadow-lg"
              >
                <Calendar size={13} className="text-indigo-400" />
                <span>{rangeLabel}</span>
                <motion.div animate={{ rotate: showRangeDropdown ? 180 : 0 }} transition={{ duration: 0.2 }}>
                  <ChevronDown size={13} className="text-zinc-500" />
                </motion.div>
              </motion.button>
              <AnimatePresence>
                {showRangeDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.95 }}
                    transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                    className="absolute right-0 mt-2 w-48 rounded-xl border border-zinc-800 bg-zinc-950/95 backdrop-blur-xl shadow-2xl p-1 z-50"
                  >
                    {DATE_RANGES.map((range, i) => (
                      <motion.button
                        key={range.key}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.04 }}
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
                      </motion.button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>

        {/* Selected project badge */}
        <AnimatePresence>
          {selectedProject && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-zinc-800/60 bg-zinc-900/40 w-fit backdrop-blur-sm"
            >
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
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error / storage warning banners */}
        <AnimatePresence>
          {loadError && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-xs text-rose-300 backdrop-blur-sm"
            >
              <AlertTriangle size={13} className="shrink-0" />
              {loadError}
            </motion.div>
          )}
        </AnimatePresence>

        {data?.storage === "in-memory" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-300 backdrop-blur-sm"
          >
            <AlertTriangle size={13} className="shrink-0" />
            No database is configured, so this workspace is held in memory and will be lost when the server restarts.
          </motion.div>
        )}

        {/* No project empty state */}
        {!loading && projects.length === 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
            className="glow-card rounded-2xl p-14 text-center"
          >
            <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 3, repeat: Infinity }}>
              <FolderOpen size={44} className="mx-auto text-zinc-700 mb-5" />
            </motion.div>
            <h3 className="text-base font-bold text-white mb-2">No Projects Connected</h3>
            <p className="text-xs text-zinc-500 mb-6">
              Connect a GitHub repository to start tracking analytics.
            </p>
            <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
              <Link
                href="/projects"
                className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl text-xs font-semibold transition shadow-lg shadow-indigo-600/30"
              >
                <Zap size={13} />
                Connect Your First Project
              </Link>
            </motion.div>
          </motion.div>
        )}

        {/* Loading skeletons */}
        {loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <SkeletonCard className="lg:col-span-2 h-64" />
              <SkeletonCard className="h-64" />
            </div>
          </motion.div>
        )}

        {/* ── Main dashboard content ── */}
        {!loading && projects.length > 0 && (
          <motion.div
            key={refreshKey}
            variants={containerVariants}
            initial="hidden"
            animate="show"
            className="space-y-6"
          >
            {/* ── Metric Cards ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {metrics.map((metric, idx) => {
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
                  <motion.div key={metric.title} variants={itemVariants}>
                    <SpotlightCard
                      glowColor={metric.glowColor}
                      className="p-5 flex flex-col justify-between overflow-hidden h-full"
                    >
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-xs text-zinc-400 font-medium tracking-wide">
                          {metric.title}
                        </span>
                        <motion.div
                          whileHover={{ scale: 1.15, rotate: 5 }}
                          className={`p-2 rounded-xl ${metric.bgClass} ${metric.colorClass}`}
                        >
                          <Icon size={14} />
                        </motion.div>
                      </div>
                      <div>
                        <h3 className={`text-2xl font-black text-white tracking-tight ${metric.colorClass}`}>
                          <AnimatedNumber value={metric.value} />
                        </h3>
                        <div className="flex items-center gap-1.5 mt-1.5">
                          {metric.direction === "up" && (
                            <motion.div
                              animate={{ y: [0, -2, 0] }}
                              transition={{ duration: 1.5, repeat: Infinity }}
                            >
                              <TrendingUp size={11} className="text-emerald-400" />
                            </motion.div>
                          )}
                          {metric.direction === "down" && (
                            <motion.div
                              animate={{ y: [0, 2, 0] }}
                              transition={{ duration: 1.5, repeat: Infinity }}
                            >
                              <TrendingDown size={11} className="text-rose-400" />
                            </motion.div>
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
                      {/* Animated sparkline */}
                      <div className="h-10 mt-3 -mx-5 -mb-5 overflow-hidden relative opacity-60">
                        <svg className="w-full h-full" viewBox="0 0 100 40" preserveAspectRatio="none">
                          <defs>
                            <linearGradient id={`spark-${idx}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={metric.accent} stopOpacity="0.3" />
                              <stop offset="100%" stopColor={metric.accent} stopOpacity="0" />
                            </linearGradient>
                          </defs>
                          <path
                            d={pathData + ` L 100 40 L 0 40 Z`}
                            fill={`url(#spark-${idx})`}
                          />
                          <path
                            d={pathData}
                            fill="none"
                            stroke={metric.accent}
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="animate-draw"
                            style={{ animationDelay: `${idx * 80}ms` }}
                          />
                        </svg>
                      </div>
                    </SpotlightCard>
                  </motion.div>
                );
              })}
            </div>

            {/* ── AST Analysis Banner ── */}
            {data?.analysis && (
              <motion.div variants={itemVariants}>
                <SpotlightCard
                  glowColor="rgba(6,182,212,0.12)"
                  className="p-5 border border-cyan-500/15"
                >
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <motion.div
                        animate={{ scale: [1, 1.08, 1] }}
                        transition={{ duration: 2.5, repeat: Infinity }}
                        className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400"
                      >
                        <Zap size={16} />
                      </motion.div>
                      <div>
                        <h4 className="text-sm font-bold text-white flex items-center gap-2">
                          AST Analysis Complete
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse-glow inline-block" />
                        </h4>
                        <p className="text-[10px] text-zinc-500 mt-0.5">
                          Last run:{" "}
                          {data.analysis.completedAt
                            ? new Date(data.analysis.completedAt).toLocaleString()
                            : "—"}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-6">
                      {[
                        { label: "Files Parsed", value: data.analysis.filesParsed },
                        { label: "Routes", value: data.analysis.routesDetected },
                        { label: "Components", value: data.analysis.componentsDetected },
                        { label: "Interactions", value: data.analysis.interactionsDetected },
                      ].map(({ label, value }, i) => (
                        <motion.div
                          key={label}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.2 + i * 0.06 }}
                          className="text-center"
                        >
                          <div className="text-lg font-black text-white">
                            <AnimatedNumber value={String(value ?? 0)} />
                          </div>
                          <div className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider mt-0.5">
                            {label}
                          </div>
                        </motion.div>
                      ))}
                    </div>
                    <motion.div whileHover={{ x: 3 }}>
                      <Link
                        href="/instrumentation"
                        className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 flex items-center gap-1.5 transition"
                      >
                        View Instrumentation <ArrowRight size={13} />
                      </Link>
                    </motion.div>
                  </div>
                </SpotlightCard>
              </motion.div>
            )}

            {/* ── Funnel & Events ── */}
            <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Funnel */}
              <SpotlightCard
                glowColor="rgba(99,102,241,0.12)"
                className="lg:col-span-2 p-6 flex flex-col"
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-white">
                        {data?.funnelMeta?.name || "User Funnel"}
                      </h3>
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
                    <span className="text-[10px] text-zinc-500 font-semibold">
                      {selectedProject?.name || "All Projects"}
                    </span>
                  </div>

                  {!hasFunnel ? (
                    <div className="py-12 text-center space-y-3">
                      <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 3, repeat: Infinity }}>
                        <BarChart3 size={32} className="mx-auto text-indigo-500/25" />
                      </motion.div>
                      <p className="text-xs font-semibold text-zinc-300">Insufficient data to determine a funnel</p>
                      <p className="text-[11px] text-zinc-500 max-w-sm mx-auto leading-relaxed">
                        A funnel is built from events this project has actually emitted. Apply an instrumentation
                        plan, then collect traffic.
                      </p>
                      <motion.div whileHover={{ x: 3 }} className="inline-block">
                        <Link
                          href="/instrumentation"
                          className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition pt-1"
                        >
                          Go to instrumentation <ArrowRight size={12} />
                        </Link>
                      </motion.div>
                    </div>
                  ) : (
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
                      {funnelSteps.map((step, idx: number) => (
                        <motion.div
                          key={step.name}
                          initial={{ opacity: 0, y: 16 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.08, duration: 0.4 }}
                          className="flex-1 flex flex-col items-center relative z-10"
                        >
                          <div className="relative">
                            <motion.div
                              whileHover={{ scale: 1.12 }}
                              className="w-12 h-12 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-300 hover:border-indigo-500 hover:text-white transition cursor-pointer shadow-lg"
                            >
                              {idx + 1}
                            </motion.div>
                            {step.dropFromPrevious > 0 && (
                              <div className="absolute -left-12 top-1/2 -translate-y-1/2 flex flex-col items-center">
                                <span className="text-[9px] text-rose-400 font-bold bg-rose-500/10 px-1.5 py-0.5 rounded-md border border-rose-500/20">
                                  ↓ {step.dropFromPrevious}%
                                </span>
                              </div>
                            )}
                          </div>
                          <span className="text-[11px] font-semibold text-zinc-300 mt-3 text-center whitespace-nowrap">
                            {step.name}
                          </span>
                          <span className="text-[13px] font-black text-white mt-1">{step.percent}%</span>
                          <span className="text-[9px] text-zinc-500 mt-0.5">
                            {step.users} user{step.users === 1 ? "" : "s"}
                          </span>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-6 p-4 rounded-xl bg-zinc-950/80 border border-zinc-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2 rounded-lg ${
                        data?.funnelMeta?.largestDropoff
                          ? "bg-rose-500/10 text-rose-400"
                          : "bg-zinc-500/10 text-zinc-400"
                      }`}
                    >
                      <AlertTriangle size={15} />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white">Top Drop-off Spot</h4>
                      <p className="text-[10px] text-zinc-400 max-w-xs">
                        {data?.funnelMeta?.largestDropoff
                          ? `${data.funnelMeta.largestDropoff.rate.toFixed(1)}% of users who reached ${data.funnelMeta.largestDropoff.from} did not continue to ${data.funnelMeta.largestDropoff.to}.`
                          : "No drop-off measured yet."}
                      </p>
                    </div>
                  </div>
                  <motion.div whileHover={{ x: 3 }}>
                    <Link
                      href="/funnel-analysis"
                      className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition flex items-center gap-1.5 whitespace-nowrap"
                    >
                      View Funnel Analysis <ArrowRight size={12} />
                    </Link>
                  </motion.div>
                </div>
              </SpotlightCard>

              {/* Top Events */}
              <SpotlightCard glowColor="rgba(168,85,247,0.12)" className="p-6 flex flex-col">
                <div>
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="text-sm font-bold text-white">Top Tracked Events</h3>
                    <motion.div whileHover={{ x: 2 }}>
                      <Link href="/events" className="text-xs text-indigo-400 font-semibold hover:text-indigo-300 transition">
                        View All
                      </Link>
                    </motion.div>
                  </div>
                  {topEvents.length === 0 ? (
                    <div className="py-10 text-center space-y-2">
                      <motion.div animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 3, repeat: Infinity }}>
                        <Activity size={26} className="mx-auto text-purple-500/30" />
                      </motion.div>
                      <p className="text-xs font-semibold text-zinc-300">No events recorded yet</p>
                      <p className="text-[11px] text-zinc-500 leading-relaxed">
                        Event names appear here once your instrumented application sends its first events.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {topEvents.map((ev, i) => (
                        <motion.div
                          key={ev.name}
                          initial={{ opacity: 0, x: -12 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.06 }}
                          className="flex items-center justify-between py-2 border-b border-zinc-900/80 last:border-0 group"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-mono shrink-0 ${ev.color}`}>
                              {ev.cat}
                            </span>
                            <span className="text-xs font-medium text-zinc-300 group-hover:text-white transition truncate" title={ev.name}>
                              {ev.name}
                            </span>
                          </div>
                          <span className="text-xs font-black text-zinc-100 shrink-0 ml-2">{ev.count}</span>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              </SpotlightCard>
            </motion.div>

            {/* ── Third Row ── */}
            <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* AI Insights */}
              <SpotlightCard glowColor="rgba(168,85,247,0.12)" className="p-6 flex flex-col">
                <div>
                  <h3 className="text-sm font-bold text-white mb-5 flex items-center gap-2">
                    <motion.div
                      animate={{ rotate: [0, 15, -10, 15, 0] }}
                      transition={{ duration: 3, repeat: Infinity, repeatDelay: 2 }}
                    >
                      <Sparkles size={14} className="text-indigo-400" />
                    </motion.div>
                    AI Insights
                  </h3>
                  <div className="space-y-4">
                    {insights && insights.length > 0 ? (
                      insights.slice(0, 3).map((ins, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.08 }}
                          className="space-y-1"
                        >
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
                          <p className="text-[10px] text-zinc-400 leading-relaxed">
                            {ins.description}
                            {ins.recommendation && (
                              <>
                                <br />
                                <span className="text-zinc-300">Tip: {ins.recommendation}</span>
                              </>
                            )}
                          </p>
                        </motion.div>
                      ))
                    ) : (
                      <p className="text-xs text-zinc-500">No AI insights yet. Run an analysis first.</p>
                    )}
                  </div>
                </div>
              </SpotlightCard>

              {/* Instrumentation Status */}
              <SpotlightCard glowColor="rgba(6,182,212,0.12)" className="p-6 flex flex-col">
                <div>
                  <h3 className="text-sm font-bold text-white mb-5">Instrumentation Status</h3>
                  <div className="flex items-center gap-5">
                    {/* Animated donut chart */}
                    <div className="relative w-20 h-20 flex items-center justify-center shrink-0">
                      <svg className="w-full h-full transform -rotate-90">
                        <circle cx="40" cy="40" r="34" className="stroke-zinc-800/80" strokeWidth="6" fill="transparent" />
                        <motion.circle
                          cx="40"
                          cy="40"
                          r="34"
                          stroke="#06b6d4"
                          strokeWidth="6"
                          fill="transparent"
                          strokeLinecap="round"
                          strokeDasharray="213"
                          initial={{ strokeDashoffset: 213 }}
                          animate={{ strokeDashoffset: Math.round(213 - (213 * instrumentationPct) / 100) }}
                          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
                        />
                      </svg>
                      <div className="absolute flex flex-col items-center justify-center">
                        <span className="text-base font-extrabold text-white">
                          <AnimatedNumber value={String(instrumentationPct)} />%
                        </span>
                        <span className="text-[8px] text-zinc-500 uppercase tracking-widest font-bold mt-0.5">Inst.</span>
                      </div>
                    </div>
                    <div className="flex-1 space-y-2">
                      {[
                        { label: "Detected", value: String(detectedComponents.length) },
                        { label: "Instrumented", value: String(instrumentedComponents.length) },
                        { label: "Pending", value: String(pendingComponents.length) },
                        { label: "Events live", value: liveEventCount > 0 ? String(liveEventCount) : `0 (${proposedEventCount} proposed)` },
                        { label: "Received", value: String(data?.eventsTracked ?? 0) },
                      ].map(({ label, value }) => (
                        <div key={label} className="flex items-center justify-between text-[11px]">
                          <span className="text-zinc-500">{label}</span>
                          <span className="font-bold text-white">{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="mt-5">
                  <Link
                    href="/instrumentation"
                    className="w-full mt-auto bg-zinc-950/80 border border-zinc-800 hover:border-cyan-500/40 hover:text-cyan-300 text-xs font-semibold py-2.5 rounded-xl text-zinc-300 transition text-center block"
                  >
                    View Instrumentation
                  </Link>
                </motion.div>
              </SpotlightCard>

              {/* Recent Activity */}
              <SpotlightCard glowColor="rgba(99,102,241,0.1)" className="p-6 flex flex-col">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-sm font-bold text-white">Recent Activity</h3>
                  <motion.div whileHover={{ x: 2 }}>
                    <Link href="/events" className="text-xs text-indigo-400 font-semibold hover:text-indigo-300 transition">
                      View All
                    </Link>
                  </motion.div>
                </div>
                <div className="space-y-3.5 flex-1">
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
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.07 }}
                          className="flex gap-2.5 items-start group"
                        >
                          <Icon size={12} className={`mt-0.5 ${act.color} group-hover:scale-110 transition-transform`} />
                          <div className="flex-1 flex flex-col">
                            <span className="text-[10px] text-zinc-300 leading-normal group-hover:text-white transition">
                              {act.desc}
                            </span>
                            {act.time && <span className="text-[9px] text-zinc-600 mt-0.5">{act.time}</span>}
                          </div>
                        </motion.div>
                      );
                    })
                  )}
                </div>
              </SpotlightCard>

              {/* System Health */}
              <SpotlightCard glowColor="rgba(16,185,129,0.1)" className="p-6 flex flex-col">
                <div>
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="text-sm font-bold text-white">System Health</h3>
                    <motion.span
                      animate={healthSummary.tone === "ok" ? { scale: [1, 1.05, 1] } : {}}
                      transition={{ duration: 2, repeat: Infinity }}
                      className={`flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-md ${
                        healthSummary.tone === "ok"
                          ? "text-emerald-400 bg-emerald-500/10 border border-emerald-500/20"
                          : healthSummary.tone === "degraded"
                          ? "text-amber-400 bg-amber-500/10 border border-amber-500/20"
                          : "text-zinc-400 bg-zinc-500/10 border border-zinc-700"
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          healthSummary.tone === "ok"
                            ? "bg-emerald-400 animate-pulse"
                            : healthSummary.tone === "degraded"
                            ? "bg-amber-400 animate-pulse"
                            : "bg-zinc-600"
                        }`}
                      />
                      {healthSummary.label}
                    </motion.span>
                  </div>
                  <div className="space-y-3">
                    {healthRows.map((row, i) => {
                      const tone = HEALTH_TONE[row.signal.state] ?? HEALTH_TONE.idle;
                      return (
                        <motion.div
                          key={row.name}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: i * 0.06 }}
                          className="space-y-0.5"
                        >
                          <div className="flex items-center justify-between text-[10px] font-semibold">
                            <span className="text-zinc-300">{row.name}</span>
                            <span className={`flex items-center gap-1 ${tone.text}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${tone.dot} ${row.signal.state === "ok" ? "animate-pulse" : ""}`} />
                              {row.signal.state === "ok"
                                ? "Operational"
                                : row.signal.state === "degraded"
                                ? "Degraded"
                                : row.signal.state === "off"
                                ? "Not configured"
                                : "Idle"}
                            </span>
                          </div>
                          <p className="text-[9px] text-zinc-600 leading-normal">{row.signal.detail}</p>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              </SpotlightCard>
            </motion.div>
          </motion.div>
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
