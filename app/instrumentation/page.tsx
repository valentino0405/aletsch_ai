"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/navigation/DashboardLayout";
import {
  Cpu,
  CheckCircle2,
  ChevronRight,
  Sparkles,
  FileCode,
  Play,
  Loader2,
  AlertTriangle,
  RefreshCw,
  X,
  Search,
  GitBranch,
  Clock,
  ChevronDown,
  ExternalLink,
  XCircle,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────

interface AnalysisSummary {
  id: string;
  status: string;
  filesScanned: number;
  filesParsed: number;
  filesSkipped: number;
  parseErrors: number;
  componentsDetected: number;
  routesDetected: number;
  interactionsDetected: number;
  routes: string[];
  errors: Array<{ filePath: string; error: string }>;
  startedAt: string;
  completedAt: string;
}

interface JobStatus {
  id: string;
  status: string;
  progress: number;
  currentStep: string;
  startedAt: string;
  completedAt?: string;
}

interface Interaction {
  id: string;
  type: string;
  label: string;
  eventName: string;
  handler: string;
  componentName: string;
  lineNumber: number;
  confidence: number;
  detectionMethod: string;
  metadata?: Record<string, unknown>;
}

interface FileGroup {
  filePath: string;
  fileName: string;
  route: string;
  interactions: Interaction[];
}

interface Project {
  id: string;
  name: string;
  repositoryUrl: string;
  status: string;
}

// ── Constants ─────────────────────────────────────────────────

const INTERACTION_TYPE_META: Record<
  string,
  { label: string; color: string; bgColor: string; icon: string }
> = {
  button_click: { label: "Button", color: "text-indigo-400", bgColor: "bg-indigo-500/10", icon: "🔘" },
  form_submit: { label: "Form", color: "text-cyan-400", bgColor: "bg-cyan-500/10", icon: "📋" },
  input_change: { label: "Input", color: "text-yellow-400", bgColor: "bg-yellow-500/10", icon: "✏️" },
  input_focus: { label: "Input Focus", color: "text-yellow-300", bgColor: "bg-yellow-500/10", icon: "🔍" },
  input_blur: { label: "Input Blur", color: "text-yellow-300", bgColor: "bg-yellow-500/10", icon: "💨" },
  navigation: { label: "Navigation", color: "text-emerald-400", bgColor: "bg-emerald-500/10", icon: "🔗" },
  selection_change: { label: "Select", color: "text-purple-400", bgColor: "bg-purple-500/10", icon: "📂" },
  tab_change: { label: "Tab", color: "text-purple-400", bgColor: "bg-purple-500/10", icon: "📑" },
  checkbox_change: { label: "Checkbox", color: "text-orange-400", bgColor: "bg-orange-500/10", icon: "☑️" },
  modal_open: { label: "Modal Open", color: "text-rose-400", bgColor: "bg-rose-500/10", icon: "🪟" },
  modal_close: { label: "Modal Close", color: "text-rose-300", bgColor: "bg-rose-500/10", icon: "🚪" },
  authentication: { label: "Auth", color: "text-amber-400", bgColor: "bg-amber-500/10", icon: "🔐" },
  repository_connection: { label: "Repo", color: "text-teal-400", bgColor: "bg-teal-500/10", icon: "📦" },
  api_action: { label: "API", color: "text-blue-400", bgColor: "bg-blue-500/10", icon: "⚡" },
  unknown: { label: "Other", color: "text-zinc-400", bgColor: "bg-zinc-500/10", icon: "❓" },
};

const FILTER_TABS = [
  { id: "all", label: "All" },
  { id: "buttons", label: "Buttons" },
  { id: "forms", label: "Forms" },
  { id: "navigation", label: "Navigation" },
  { id: "inputs", label: "Inputs" },
  { id: "selection", label: "Selection" },
  { id: "authentication", label: "Auth" },
  { id: "repository", label: "Repository" },
];

// ── Helpers ───────────────────────────────────────────────────

function confidencePct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function getFileCategoryLabel(interactions: Interaction[]): string {
  const types = interactions.map((i) => i.type);
  if (types.includes("form_submit")) return "Form Block";
  if (types.includes("authentication")) return "Auth Block";
  if (types.includes("repository_connection")) return "Repository";
  if (types.includes("navigation")) return "Navigation";
  if (types.every((t) => t.startsWith("button"))) return "CTA Button";
  if (types.every((t) => t.startsWith("input"))) return "Input Block";
  return "Interaction Block";
}

// ── Interaction Detail Modal ──────────────────────────────────

function InteractionModal({
  interaction,
  filePath,
  route,
  onClose,
}: {
  interaction: Interaction;
  filePath: string;
  route: string;
  onClose: () => void;
}) {
  const meta = INTERACTION_TYPE_META[interaction.type] || INTERACTION_TYPE_META.unknown;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="max-w-lg w-full rounded-2xl border border-zinc-800 bg-[#09090f] shadow-2xl p-6 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-zinc-500 hover:text-white transition">
          <X size={18} />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <span className="text-xl">{meta.icon}</span>
          <div>
            <h2 className="text-base font-bold text-white">{interaction.label}</h2>
            <span className={`text-[10px] font-mono font-bold uppercase ${meta.color}`}>
              {interaction.type}
            </span>
          </div>
        </div>

        <div className="space-y-3 text-xs">
          {[
            { label: "Event Name", value: interaction.eventName, mono: true },
            { label: "Component", value: interaction.componentName },
            { label: "Handler", value: interaction.handler || "—", mono: true },
            { label: "File", value: filePath.split("/").slice(-2).join("/"), mono: true },
            { label: "Route", value: route },
            { label: "Line", value: `${interaction.lineNumber}` },
            {
              label: "Confidence",
              value: confidencePct(interaction.confidence),
              badge: interaction.confidence >= 0.9 ? "emerald" : interaction.confidence >= 0.7 ? "yellow" : "rose",
            },
            { label: "Detection", value: interaction.detectionMethod, mono: true },
          ].map(({ label, value, mono, badge }) => (
            <div key={label} className="flex items-start justify-between gap-4 border-b border-zinc-900 pb-3">
              <span className="text-zinc-500 font-semibold uppercase tracking-wider text-[10px] min-w-[100px]">
                {label}
              </span>
              {badge ? (
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    badge === "emerald"
                      ? "bg-emerald-500/15 text-emerald-400"
                      : badge === "yellow"
                      ? "bg-yellow-500/15 text-yellow-400"
                      : "bg-rose-500/15 text-rose-400"
                  }`}
                >
                  {value}
                </span>
              ) : (
                <span className={`text-zinc-200 text-right break-all ${mono ? "font-mono" : ""}`}>{value}</span>
              )}
            </div>
          ))}
        </div>

        <div className="mt-4 p-3 rounded-lg bg-zinc-900/60 border border-zinc-800">
          <p className="text-[10px] text-zinc-500 font-semibold uppercase mb-1">Status</p>
          <p className="text-xs text-emerald-400 font-semibold flex items-center gap-1.5">
            <CheckCircle2 size={12} />
            Detected — Ready for instrumentation
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────

export default function Instrumentation() {
  // Pipeline steps with real status
  const [pipelineSteps, setPipelineSteps] = useState([
    { title: "Repository Sync", desc: "Cloning application components tree", status: "pending" },
    { title: "Code Analysis", desc: "Parsing AST structures & files hierarchy", status: "pending" },
    { title: "Intent Detection", desc: "Maps buttons, forms, and page purposes", status: "pending" },
    { title: "Event Generation", desc: "Synthesizing interaction tracking schema", status: "future" },
    { title: "Auto Injection", desc: "Injecting telemetry middleware into repo", status: "future" },
  ]);

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [analysis, setAnalysis] = useState<AnalysisSummary | null>(null);
  const [job, setJob] = useState<JobStatus | null>(null);
  const [grouped, setGrouped] = useState<FileGroup[]>([]);
  const [totalInteractions, setTotalInteractions] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<{
    branch: string;
    baseBranch: string;
    pullRequestUrl: string;
    pullRequestNumber: number;
    message: string;
  } | null>(null);
  const [activeFilter, setActiveFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedInteraction, setSelectedInteraction] = useState<{
    interaction: Interaction;
    filePath: string;
    route: string;
  } | null>(null);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [terminalLines, setTerminalLines] = useState<string[]>(["$ aletsch analyze ./src"]);
  const [loadError, setLoadError] = useState("");
  // One interval, held in a ref. Two useState timers used to run at once —
  // one from the polling effect and one started by the Run button — and the
  // second was never cleared, so it kept hitting the API after the job ended.
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  // Load projects
  useEffect(() => {
    fetch("/api/projects")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: any[]) => {
        if (Array.isArray(data)) {
          const normalized = data.map((p) => ({
            id: p._id || p.id,
            name: p.name,
            repositoryUrl: p.repositoryUrl || "",
            status: p.status || "Connected",
          }));
          setProjects(normalized);
          if (normalized.length > 0) {
            setSelectedProjectId((current) => current || normalized[0].id);
          }
        }
      })
      .catch(() => setLoadError("Projects could not be loaded."));
  }, []);

  // Fetch instrumentation data
  const fetchData = useCallback(async (pid?: string) => {
    const id = pid || selectedProjectId;
    if (!id) return;

    const params = new URLSearchParams({ projectId: id });
    if (activeFilter && activeFilter !== "all") params.set("type", activeFilter);
    if (searchQuery) params.set("search", searchQuery);

    try {
      const res = await fetch(`/api/instrumentation?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setLoadError(data.error || "Instrumentation data could not be loaded.");
        return;
      }
      setLoadError("");
      const data = await res.json();

      setAnalysis(data.analysis || null);
      setJob(data.job || null);
      setGrouped(data.grouped || []);
      setTotalInteractions(data.totalInteractions || 0);

      // Update pipeline status
      const hasAnalysis = !!data.analysis;
      const jobStatus = data.job?.status;
      const isRunning = jobStatus === "running" || jobStatus === "queued";
      const isDone = hasAnalysis && (data.analysis.status?.startsWith("completed"));

      setPipelineSteps((prev) =>
        prev.map((step, idx) => {
          if (idx === 0) return { ...step, status: hasAnalysis || isRunning ? "complete" : "pending" };
          if (idx === 1) return { ...step, status: isDone ? "complete" : isRunning ? "active" : "pending" };
          if (idx === 2) return { ...step, status: isDone ? "complete" : "pending" };
          return { ...step, status: "future" };
        })
      );

      // Update terminal output
      if (data.analysis) {
        const a = data.analysis;
        setTerminalLines([
          "$ aletsch analyze ./src",
          `> Scanning ${a.filesScanned || 0} source files...`,
          `> ${a.filesParsed || 0} files parsed successfully`,
          a.parseErrors > 0 ? `> ⚠ ${a.parseErrors} files skipped (parse errors)` : "",
          `> ${a.routesDetected || 0} routes detected`,
          `> ${a.componentsDetected || 0} components mapped`,
          `> ${a.interactionsDetected || 0} interactions detected`,
          `> Status: ${a.status === "completed_with_warnings" ? "completed with warnings" : a.status}`,
        ].filter(Boolean));
      } else if (isRunning && data.job) {
        setTerminalLines([
          "$ aletsch analyze ./src",
          `> ${data.job.currentStep || "Analyzing..."}`,
          `> Progress: ${data.job.progress || 0}%`,
        ]);
      }
    } catch {
      setLoadError("Network error while loading instrumentation data.");
    }
  }, [selectedProjectId, activeFilter, searchQuery]);

  useEffect(() => {
    if (selectedProjectId) {
      fetchData(selectedProjectId);
    }
  }, [selectedProjectId, activeFilter, searchQuery, fetchData]);

  // A single polling loop, started when a job is in flight and torn down
  // when it is not — including on unmount.
  useEffect(() => {
    if (!isAnalyzing) {
      stopPolling();
      return;
    }
    pollTimer.current = setInterval(() => {
      fetchData();
    }, 2500);
    return stopPolling;
  }, [isAnalyzing, fetchData, stopPolling]);

  // Stop polling when the job reaches a terminal state.
  useEffect(() => {
    if (job && !["queued", "running"].includes(job.status) && isAnalyzing) {
      setIsAnalyzing(false);
    }
  }, [job, isAnalyzing]);

  const handleRunAnalysis = async () => {
    if (!selectedProjectId || isAnalyzing) return;
    setIsAnalyzing(true);
    setLoadError("");
    setTerminalLines(["$ aletsch analyze ./src", "> Starting AST analysis..."]);

    try {
      const res = await fetch(`/api/repositories/${selectedProjectId}/analyze`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setTerminalLines(["$ aletsch analyze ./src", `> Error: ${data.error || "Analysis failed"}`]);
        setIsAnalyzing(false);
        return;
      }
      setTerminalLines([
        "$ aletsch analyze ./src",
        "> Analysis queued successfully...",
        `> Job ID: ${data.jobId}`,
      ]);
      // The polling effect owns the interval; setting isAnalyzing starts it.
    } catch (err: any) {
      setTerminalLines(["$ aletsch analyze ./src", `> Network error: ${err?.message}`]);
      setIsAnalyzing(false);
    }
  };

  // Applying opens a pull request against the tracked branch. The result
  // is kept in state so the PR link survives the next data refresh.
  const handleApply = async () => {
    if (!selectedProjectId || isApplying || isAnalyzing) return;
    setIsApplying(true);
    setLoadError("");
    setTerminalLines(["$ aletsch apply", "> Rebuilding the change set from the repository..."]);

    try {
      const res = await fetch("/api/instrumentation/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: selectedProjectId }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setTerminalLines([
          "$ aletsch apply",
          `> Error: ${data.error || "The instrumentation could not be applied."}`,
        ]);
        setIsApplying(false);
        return;
      }

      if (!data.applied) {
        setTerminalLines(["$ aletsch apply", `> ${data.message || "Nothing to apply."}`]);
        setIsApplying(false);
        return;
      }

      setApplyResult({
        branch: data.branch,
        baseBranch: data.baseBranch,
        pullRequestUrl: data.pullRequest?.url || "",
        pullRequestNumber: data.pullRequest?.number ?? 0,
        message: data.message || "",
      });
      setTerminalLines([
        "$ aletsch apply",
        `> Branch created: ${data.branch}`,
        `> ${data.message}`,
        `> Pull request #${data.pullRequest?.number} opened against ${data.baseBranch}.`,
      ]);
      fetchData();
    } catch (err: unknown) {
      setTerminalLines(["$ aletsch apply", `> Network error: ${(err as Error)?.message}`]);
    } finally {
      setIsApplying(false);
    }
  };

  const toggleFileExpanded = (filePath: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) next.delete(filePath);
      else next.add(filePath);
      return next;
    });
  };

  const isJobRunning = job && ["queued", "running"].includes(job.status);

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Page Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Auto-Instrumentation</h1>
            <p className="text-sm text-zinc-400 mt-1">
              Aletsch AI reads and maps your codebase to detect user interactions automatically.
            </p>
          </div>
          {/* Project Selector */}
          {projects.length > 1 && (
            <div className="relative">
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="appearance-none bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs rounded-lg px-3 py-2 pr-8 outline-none cursor-pointer"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={12} className="absolute right-2 top-2.5 text-zinc-500 pointer-events-none" />
            </div>
          )}
        </div>

        {loadError && (
          <div className="flex items-center gap-2 rounded-lg border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-xs text-rose-300">
            <XCircle size={13} className="shrink-0" />
            {loadError}
          </div>
        )}

        {/* No project state */}
        {projects.length === 0 && (
          <div className="glow-card rounded-xl p-8 text-center">
            <GitBranch size={32} className="mx-auto text-zinc-600 mb-3" />
            <h3 className="text-sm font-bold text-white mb-2">No Projects Connected</h3>
            <p className="text-xs text-zinc-500">
              Connect a GitHub repository first from the{" "}
              <Link href="/repositories" className="text-indigo-400 hover:underline">
                Repositories
              </Link>{" "}
              page.
            </p>
          </div>
        )}

        {projects.length > 0 && (
          <>
            {/* Pipeline Workflow */}
            <div className="glow-card rounded-xl p-6 glow-cyan relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/5 rounded-full blur-2xl" />
              <h3 className="text-sm font-bold text-white mb-6">Auto-Instrumentation Pipeline</h3>

              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                {pipelineSteps.map((st, idx) => (
                  <div key={st.title} className="flex-1 flex flex-col md:flex-row md:items-center gap-3">
                    <div
                      className={`flex flex-col p-4 rounded-xl border relative z-10 w-full transition ${
                        st.status === "complete"
                          ? "border-emerald-500/30 bg-emerald-500/5"
                          : st.status === "active"
                          ? "border-cyan-500/40 bg-cyan-500/5 animate-pulse"
                          : st.status === "future"
                          ? "border-zinc-800/40 bg-zinc-950/20 opacity-50"
                          : "border-zinc-800/80 bg-zinc-950/40"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[9px] font-mono font-bold text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded">
                          0{idx + 1}
                        </span>
                        <span className="text-xs font-bold text-white">{st.title}</span>
                        <span className="ml-auto">
                          {st.status === "complete" && <CheckCircle2 size={12} className="text-emerald-400" />}
                          {st.status === "active" && <Loader2 size={12} className="text-cyan-400 animate-spin" />}
                          {st.status === "future" && <Clock size={12} className="text-zinc-600" />}
                        </span>
                      </div>
                      <p className="text-[10px] text-zinc-500 leading-normal">{st.desc}</p>
                    </div>
                    {idx < pipelineSteps.length - 1 && (
                      <ChevronRight className="hidden md:block text-zinc-600 rotate-90 md:rotate-0 shrink-0" size={16} />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Analysis Summary Stats + Right Panel Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left: Stats + Interactions */}
              <div className="lg:col-span-2 space-y-5">
                {/* Summary stats */}
                {analysis && (
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                    {[
                      { label: "Files", value: analysis.filesScanned },
                      { label: "Parsed", value: analysis.filesParsed },
                      { label: "Routes", value: analysis.routesDetected },
                      { label: "Components", value: analysis.componentsDetected },
                      { label: "Interactions", value: analysis.interactionsDetected },
                      {
                        label: "Success",
                        value:
                          analysis.filesScanned > 0
                            ? `${Math.round((analysis.filesParsed / analysis.filesScanned) * 100)}%`
                            : "—",
                      },
                    ].map(({ label, value }) => (
                      <div
                        key={label}
                        className="glow-card rounded-xl p-3 flex flex-col items-center justify-center text-center"
                      >
                        <span className="text-lg font-bold text-white">{value}</span>
                        <span className="text-[10px] text-zinc-500 font-semibold uppercase mt-0.5">{label}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Warnings */}
                {analysis && analysis.parseErrors > 0 && (
                  <div className="flex items-start gap-3 p-3 rounded-lg border border-yellow-500/20 bg-yellow-500/5 text-xs text-yellow-400">
                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                    <span>
                      Analysis completed with {analysis.parseErrors} file
                      {analysis.parseErrors > 1 ? "s" : ""} skipped due to parsing errors.
                    </span>
                  </div>
                )}

                {/* Job progress */}
                {isJobRunning && job && (
                  <div className="glow-card rounded-xl p-4 glow-indigo">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Loader2 size={12} className="text-indigo-400 animate-spin" />
                        <span className="text-xs font-semibold text-white">Analyzing Repository...</span>
                      </div>
                      <span className="text-[10px] font-mono text-indigo-400">{job.progress}%</span>
                    </div>
                    <div className="w-full bg-zinc-900 rounded-full h-1.5">
                      <div
                        className="bg-indigo-500 h-1.5 rounded-full transition-all duration-500"
                        style={{ width: `${job.progress}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-zinc-500 mt-2 truncate">{job.currentStep}</p>
                  </div>
                )}

                {/* Filters + search */}
                {(grouped.length > 0 || analysis) && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 relative">
                        <Search size={12} className="absolute left-2.5 top-2.5 text-zinc-500" />
                        <input
                          type="text"
                          placeholder="Search by file, component, label..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-800 focus:border-indigo-500 rounded-lg pl-8 pr-3 py-2 text-xs text-zinc-200 placeholder-zinc-600 outline-none transition"
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {FILTER_TABS.map((tab) => (
                        <button
                          key={tab.id}
                          onClick={() => setActiveFilter(tab.id)}
                          className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                            activeFilter === tab.id
                              ? "bg-indigo-600 text-white"
                              : "bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800"
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                      <span className="text-[10px] text-zinc-600 self-center ml-2">
                        {totalInteractions} total
                      </span>
                    </div>
                  </div>
                )}

                {/* Detected Core Interactions */}
                <div>
                  <h3 className="text-xs uppercase font-bold text-zinc-500 tracking-wider mb-3">
                    Detected Core Interactions
                  </h3>

                  {!analysis && !isJobRunning && (
                    <div className="glow-card rounded-xl p-8 text-center">
                      <Cpu size={28} className="mx-auto text-zinc-600 mb-3" />
                      <p className="text-sm font-semibold text-zinc-400">No analysis run yet.</p>
                      <p className="text-xs text-zinc-600 mt-1">
                        Click &quot;Run AST Analysis&quot; to start scanning your repository.
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    {grouped.map((group) => {
                      const categoryLabel = getFileCategoryLabel(group.interactions);
                      const isExpanded = expandedFiles.has(group.filePath);
                      const avgConf =
                        group.interactions.reduce((s, i) => s + i.confidence, 0) / group.interactions.length;

                      return (
                        <div key={group.filePath} className="glow-card rounded-xl overflow-hidden">
                          {/* File row header */}
                          <div
                            className="p-4 flex items-center justify-between cursor-pointer hover:bg-zinc-900/30 transition"
                            onClick={() => toggleFileExpanded(group.filePath)}
                          >
                            <div className="flex items-start gap-3">
                              <div className="p-2 rounded-lg bg-zinc-900 text-zinc-400 shrink-0">
                                <FileCode size={16} />
                              </div>
                              <div>
                                <h4 className="text-sm font-bold text-white">{group.fileName}</h4>
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                  <span className="text-[10px] font-semibold text-zinc-500 uppercase bg-zinc-900 px-2 py-0.5 rounded">
                                    {categoryLabel}
                                  </span>
                                  <span className="text-[10px] text-zinc-600">•</span>
                                  <span className="text-[10px] text-zinc-500 font-semibold uppercase">
                                    {group.interactions.length} Event{group.interactions.length !== 1 ? "s" : ""} Detected
                                  </span>
                                  {group.route && group.route !== "(component)" && (
                                    <>
                                      <span className="text-[10px] text-zinc-600">•</span>
                                      <span className="text-[10px] text-indigo-400 font-mono">{group.route}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 shrink-0 ml-2">
                              <div className="text-right hidden sm:block">
                                <span className="text-[10px] text-zinc-400 font-bold block">
                                  {confidencePct(avgConf)} avg
                                </span>
                                <span className="text-[9px] text-emerald-400 font-semibold block">DETECTED</span>
                              </div>
                              <ChevronDown
                                size={14}
                                className={`text-zinc-600 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                              />
                            </div>
                          </div>

                          {/* Expanded interactions list */}
                          {isExpanded && (
                            <div className="border-t border-zinc-900 divide-y divide-zinc-900/60">
                              {group.interactions.map((interaction) => {
                                const typeMeta =
                                  INTERACTION_TYPE_META[interaction.type] || INTERACTION_TYPE_META.unknown;
                                return (
                                  <div
                                    key={interaction.id}
                                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-zinc-900/20 cursor-pointer transition"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedInteraction({
                                        interaction,
                                        filePath: group.filePath,
                                        route: group.route,
                                      });
                                    }}
                                  >
                                    <div className="flex items-center gap-3 min-w-0">
                                      <span
                                        className={`text-[10px] font-semibold px-2 py-0.5 rounded ${typeMeta.bgColor} ${typeMeta.color} shrink-0`}
                                      >
                                        {typeMeta.label}
                                      </span>
                                      <div className="min-w-0">
                                        <span className="text-xs text-zinc-200 truncate block">
                                          {interaction.label}
                                        </span>
                                        <span className="text-[10px] text-zinc-600 font-mono truncate block">
                                          {interaction.eventName}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      <span className="text-[10px] text-zinc-500">
                                        L{interaction.lineNumber}
                                      </span>
                                      <span
                                        className={`text-[10px] font-bold ${
                                          interaction.confidence >= 0.9
                                            ? "text-emerald-400"
                                            : interaction.confidence >= 0.7
                                            ? "text-yellow-400"
                                            : "text-rose-400"
                                        }`}
                                      >
                                        {confidencePct(interaction.confidence)}
                                      </span>
                                      <ExternalLink size={10} className="text-zinc-700" />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Right: Telemetry Generator Panel */}
              <div className="glow-card rounded-xl p-6 glow-purple flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
                    <Sparkles size={14} className="text-indigo-400" />
                    Repository Analyzer
                  </h3>
                  <p className="text-xs text-zinc-400 leading-relaxed mb-4">
                    Run the AST engine to scan your connected repository and detect all user interactions.
                  </p>

                  {/* Terminal output */}
                  <div className="bg-black/60 p-4 rounded-lg border border-zinc-900 font-mono text-[10px] mb-5 min-h-[100px] space-y-0.5">
                    {terminalLines.map((line, i) => (
                      <div
                        key={i}
                        className={
                          line.startsWith(">") && line.includes("Error")
                            ? "text-rose-400"
                            : line.startsWith(">") && line.includes("⚠")
                            ? "text-yellow-400"
                            : line.startsWith(">")
                            ? i === terminalLines.length - 1
                              ? "text-emerald-400"
                              : "text-cyan-400"
                            : "text-zinc-400"
                        }
                      >
                        {line}
                        {i === terminalLines.length - 1 && isJobRunning && (
                          <span className="animate-pulse">_</span>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Project selector if needed */}
                  {projects.length > 0 && (
                    <div className="mb-4 text-xs text-zinc-500">
                      Project:{" "}
                      <span className="text-zinc-300 font-semibold">
                        {projects.find((p) => p.id === selectedProjectId)?.name || "—"}
                      </span>
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                <div className="space-y-2">
                  <button
                    onClick={handleRunAnalysis}
                    disabled={isAnalyzing || !selectedProjectId}
                    className="w-full flex items-center justify-center gap-1.5 bg-indigo-600/10 hover:bg-indigo-600/20 disabled:opacity-50 disabled:cursor-not-allowed text-indigo-400 border border-indigo-500/20 rounded-lg py-2.5 text-xs font-semibold transition cursor-pointer"
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 size={12} className="animate-spin" />
                        <span>Analyzing...</span>
                      </>
                    ) : analysis ? (
                      <>
                        <RefreshCw size={12} />
                        <span>Re-analyze Repository</span>
                      </>
                    ) : (
                      <>
                        <Play size={12} />
                        <span>Run AST Analysis</span>
                      </>
                    )}
                  </button>

                  {/* Applying is only meaningful once interactions exist to
                      instrument, so the button stays out of the way until
                      an analysis has actually found some. */}
                  {totalInteractions > 0 && (
                    <button
                      onClick={handleApply}
                      disabled={isApplying || isAnalyzing || !selectedProjectId}
                      className="w-full flex items-center justify-center gap-1.5 bg-emerald-600/10 hover:bg-emerald-600/20 disabled:opacity-50 disabled:cursor-not-allowed text-emerald-400 border border-emerald-500/20 rounded-lg py-2.5 text-xs font-semibold transition cursor-pointer"
                    >
                      {isApplying ? (
                        <>
                          <Loader2 size={12} className="animate-spin" />
                          <span>Opening pull request...</span>
                        </>
                      ) : (
                        <>
                          <GitBranch size={12} />
                          <span>Apply &amp; Open Pull Request</span>
                        </>
                      )}
                    </button>
                  )}

                  {applyResult && (
                    <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-[10px] text-zinc-400 space-y-1">
                      <div className="text-emerald-400 font-semibold">
                        Pull request #{applyResult.pullRequestNumber} opened
                      </div>
                      <div>{applyResult.message}</div>
                      {applyResult.pullRequestUrl && (
                        <a
                          href={applyResult.pullRequestUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-medium transition"
                        >
                          Review on GitHub <ExternalLink size={10} />
                        </a>
                      )}
                    </div>
                  )}

                  {analysis && (
                    <div className="text-center text-[10px] text-zinc-600">
                      Last run:{" "}
                      {analysis.completedAt
                        ? new Date(analysis.completedAt).toLocaleString()
                        : "—"}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* Interaction Detail Modal */}
        {selectedInteraction && (
          <InteractionModal
            interaction={selectedInteraction.interaction}
            filePath={selectedInteraction.filePath}
            route={selectedInteraction.route}
            onClose={() => setSelectedInteraction(null)}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
