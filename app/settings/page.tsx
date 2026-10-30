"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/navigation/DashboardLayout";
import {
  Settings as SettingsIcon,
  Shield,
  Sliders,
  Terminal,
  Bell,
  Loader2,
  XCircle,
  Check,
  Copy,
  Eye,
  EyeOff,
  RefreshCw,
  GitBranch,
  ExternalLink,
  Lock,
  Globe,
  AlertTriangle,
} from "lucide-react";

interface Project {
  id: string;
  name: string;
  repositoryUrl: string;
  branch: string;
  language: string;
  isPrivate: boolean;
  status: string;
}

interface GitHubStatus {
  connected: boolean;
  githubLogin: string | null;
  githubName: string | null;
  scopes: string[];
  connectedAt: string | null;
  mode: "user_oauth" | "server_pat" | "none";
  oauthAvailable: boolean;
  unavailableReason?: string;
}

interface WriteKeyInfo {
  writeKey: string;
  ingestUrl: string;
  envVarName?: string;
  storage?: string;
}

const TABS = [
  { name: "General Settings", icon: Sliders },
  { name: "Repository Configuration", icon: Terminal },
  { name: "Notification Preferences", icon: Bell },
  { name: "Security & API Access", icon: Shield },
] as const;

/** Local-only preferences. Nothing here is sent to the server. */
interface Preferences {
  activeProjectId: string;
  funnelPredictions: boolean;
  alertEmails: boolean;
  anomalyThreshold: number;
}

const DEFAULT_PREFERENCES: Preferences = {
  activeProjectId: "",
  funnelPredictions: true,
  alertEmails: true,
  anomalyThreshold: 20,
};

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1800);
        } catch {
          // Clipboard is unavailable over plain HTTP; the value stays selectable.
        }
      }}
      title={`Copy ${label}`}
      className="shrink-0 p-1.5 rounded-md text-zinc-500 hover:text-white hover:bg-zinc-800 transition cursor-pointer"
    >
      {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
    </button>
  );
}

export default function Settings() {
  const [activeTab, setActiveTab] = useState<string>("General Settings");

  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const [github, setGithub] = useState<GitHubStatus | null>(null);
  const [githubBusy, setGithubBusy] = useState(false);
  const [githubNote, setGithubNote] = useState("");

  const [writeKey, setWriteKey] = useState<WriteKeyInfo | null>(null);
  const [keyVisible, setKeyVisible] = useState(false);
  const [keyLoading, setKeyLoading] = useState(false);
  const [keyError, setKeyError] = useState("");
  const [rotateWarning, setRotateWarning] = useState("");
  const [confirmRotate, setConfirmRotate] = useState(false);

  const [syncing, setSyncing] = useState(false);
  const [syncNote, setSyncNote] = useState("");

  // ── Load projects, then reconcile the stored preference against them ──
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/projects");
        const data = await response.json().catch(() => []);
        if (cancelled) return;
        if (!response.ok) {
          setError(data.error || "Projects could not be loaded.");
          return;
        }
        const list: Project[] = (Array.isArray(data) ? data : []).map((project: any) => ({
          id: project._id || project.id,
          name: project.name || "Unnamed project",
          repositoryUrl: project.repositoryUrl || "",
          branch: project.branch || "main",
          language: project.language || "Unknown",
          isPrivate: Boolean(project.isPrivate),
          status: project.status || "Unknown",
        }));
        setProjects(list);

        // Restore preferences. The active project must still exist —
        // a stale id from a deleted project would silently point nowhere.
        let restored = { ...DEFAULT_PREFERENCES };
        try {
          const stored = localStorage.getItem("aletsch-settings");
          if (stored) {
            const parsed = JSON.parse(stored);
            if (typeof parsed.activeProjectId === "string") restored.activeProjectId = parsed.activeProjectId;
            if (typeof parsed.funnelPredictions === "boolean") restored.funnelPredictions = parsed.funnelPredictions;
            if (typeof parsed.alertEmails === "boolean") restored.alertEmails = parsed.alertEmails;
            if (typeof parsed.anomalyThreshold === "number") restored.anomalyThreshold = parsed.anomalyThreshold;
          }
        } catch {
          localStorage.removeItem("aletsch-settings");
        }
        if (!list.some((project) => project.id === restored.activeProjectId)) {
          restored.activeProjectId = list[0]?.id || "";
        }
        setPreferences(restored);
      } catch {
        if (!cancelled) setError("Network error while loading projects.");
      } finally {
        if (!cancelled) setLoadingProjects(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── GitHub connection status ──
  const loadGitHub = useCallback(async () => {
    try {
      const response = await fetch("/api/github/status");
      const data = await response.json().catch(() => null);
      setGithub(response.ok ? data : null);
    } catch {
      setGithub(null);
    }
  }, []);

  useEffect(() => {
    loadGitHub();
  }, [loadGitHub]);

  const activeProject = projects.find((project) => project.id === preferences.activeProjectId) || null;

  // ── Write key, fetched only for the selected project ──
  const loadWriteKey = useCallback(async (projectId: string) => {
    if (!projectId) {
      setWriteKey(null);
      return;
    }
    setKeyLoading(true);
    setKeyError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/write-key`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setWriteKey(null);
        setKeyError(data.error || "The write key could not be read.");
        return;
      }
      setWriteKey(data);
    } catch {
      setWriteKey(null);
      setKeyError("Network error while reading the write key.");
    } finally {
      setKeyLoading(false);
    }
  }, []);

  useEffect(() => {
    // Only fetch the key once the user opens the tab that displays it.
    if (activeTab === "Security & API Access") {
      loadWriteKey(preferences.activeProjectId);
      setKeyVisible(false);
      setConfirmRotate(false);
    }
  }, [activeTab, preferences.activeProjectId, loadWriteKey]);

  const savePreferences = () => {
    localStorage.setItem("aletsch-settings", JSON.stringify(preferences));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  };

  const discardChanges = () => {
    // Falls back to the first real project rather than a hardcoded name.
    setPreferences({ ...DEFAULT_PREFERENCES, activeProjectId: projects[0]?.id || "" });
    setSaved(false);
  };

  const disconnectGitHub = async () => {
    setGithubBusy(true);
    setGithubNote("");
    try {
      const response = await fetch("/api/github/disconnect", { method: "POST" });
      const data = await response.json().catch(() => ({}));
      setGithubNote(data.message || (response.ok ? "Disconnected." : "Could not disconnect."));
      await loadGitHub();
    } catch {
      setGithubNote("Network error while disconnecting.");
    } finally {
      setGithubBusy(false);
    }
  };

  const rotateKey = async () => {
    if (!preferences.activeProjectId) return;
    setKeyLoading(true);
    setKeyError("");
    try {
      const response = await fetch(`/api/projects/${preferences.activeProjectId}/write-key`, {
        method: "POST",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setKeyError(data.error || "The key could not be rotated.");
        return;
      }
      setWriteKey((current) => ({
        writeKey: data.writeKey,
        ingestUrl: current?.ingestUrl || "",
        envVarName: current?.envVarName,
      }));
      setRotateWarning(data.warning || "");
      setKeyVisible(true);
      setConfirmRotate(false);
    } catch {
      setKeyError("Network error while rotating the key.");
    } finally {
      setKeyLoading(false);
    }
  };

  const syncActiveProject = async () => {
    if (!activeProject) return;
    setSyncing(true);
    setSyncNote("");
    try {
      const response = await fetch(`/api/repositories/${activeProject.id}/sync`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      setSyncNote(response.ok ? data.message || "Re-analysis started." : data.error || "Sync failed.");
    } catch {
      setSyncNote("Network error while syncing.");
    } finally {
      setSyncing(false);
    }
  };

  const modeLabel =
    github?.mode === "user_oauth"
      ? "Your GitHub account (public + private repositories)"
      : github?.mode === "server_pat"
      ? "Server token (public repositories only)"
      : "Unauthenticated (public repositories, heavily rate-limited)";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <SettingsIcon className="text-indigo-400" />
            Settings
          </h1>
          <p className="text-sm text-zinc-400">
            Your GitHub connection, project write key and local analysis preferences.
          </p>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-xs text-rose-300">
            <XCircle size={13} className="shrink-0" />
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Tabs */}
          <div className="lg:col-span-1 space-y-2">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.name}
                  onClick={() => setActiveTab(tab.name)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold transition cursor-pointer text-left ${
                    activeTab === tab.name
                      ? "bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 glow-indigo"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40 border border-transparent"
                  }`}
                >
                  <Icon size={14} />
                  <span>{tab.name}</span>
                </button>
              );
            })}
          </div>

          {/* Panel */}
          <div className="lg:col-span-2 glow-card rounded-xl p-6 glow-indigo space-y-6">
            <h3 className="text-sm font-bold text-white border-b border-zinc-900 pb-3">{activeTab}</h3>

            {/* ─────────────── General ─────────────── */}
            {activeTab === "General Settings" && (
              <div className="space-y-5">
                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-500 block mb-1.5">
                    Active Project
                  </label>
                  {loadingProjects ? (
                    <span className="inline-flex items-center gap-2 text-xs text-zinc-500">
                      <Loader2 size={12} className="animate-spin" /> Loading projects...
                    </span>
                  ) : projects.length === 0 ? (
                    <p className="text-xs text-zinc-500">
                      No projects yet.{" "}
                      <Link href="/projects" className="text-indigo-400 hover:text-indigo-300 transition">
                        Connect a repository
                      </Link>{" "}
                      to configure one.
                    </p>
                  ) : (
                    <select
                      value={preferences.activeProjectId}
                      onChange={(event) =>
                        setPreferences((current) => ({ ...current, activeProjectId: event.target.value }))
                      }
                      className="w-full max-w-md bg-zinc-900 border border-zinc-800 focus:border-indigo-500 rounded-lg px-3.5 py-2 text-xs text-zinc-200 outline-none transition cursor-pointer"
                    >
                      {projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <p className="text-[10px] text-zinc-600 mt-1.5">
                    The project this Settings page reads and writes. Project names come from the connected
                    repository and are changed on GitHub.
                  </p>
                </div>

                <div className="space-y-3 pt-4 border-t border-zinc-900">
                  <h4 className="text-xs font-bold text-white">Analysis Preferences</h4>
                  <p className="text-[10px] text-zinc-600 -mt-1">
                    Stored in this browser only. They are not shared across devices or accounts.
                  </p>

                  <div className="flex items-center justify-between py-2 border-b border-zinc-900">
                    <div className="pr-4">
                      <span className="text-xs font-medium text-zinc-300 block">AI Funnel Predictions</span>
                      <span className="text-[10px] text-zinc-500">
                        Let Aletsch propose funnels from the detected component tree.
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={preferences.funnelPredictions}
                      onChange={(event) =>
                        setPreferences((current) => ({
                          ...current,
                          funnelPredictions: event.target.checked,
                        }))
                      }
                      className="accent-indigo-500 cursor-pointer"
                    />
                  </div>

                  <div className="flex items-center justify-between py-2">
                    <div className="pr-4">
                      <span className="text-xs font-medium text-zinc-300 block">Drop-off Threshold</span>
                      <span className="text-[10px] text-zinc-500">
                        Flag a funnel step when it loses at least this share of users.
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <input
                        type="range"
                        min={5}
                        max={80}
                        step={5}
                        value={preferences.anomalyThreshold}
                        onChange={(event) =>
                          setPreferences((current) => ({
                            ...current,
                            anomalyThreshold: Number(event.target.value),
                          }))
                        }
                        className="accent-indigo-500 cursor-pointer"
                      />
                      <span className="text-xs font-mono text-zinc-300 w-9 text-right">
                        {preferences.anomalyThreshold}%
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-5 border-t border-zinc-900">
                  <button
                    onClick={discardChanges}
                    className="px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-white transition cursor-pointer"
                  >
                    Discard Changes
                  </button>
                  <button
                    onClick={savePreferences}
                    className="px-4 py-2 bg-accent hover:bg-accent-hover text-on-accent text-xs font-semibold rounded-lg shadow-md transition cursor-pointer"
                  >
                    {saved ? "Saved" : "Save Preferences"}
                  </button>
                </div>
              </div>
            )}

            {/* ─────────── Repository configuration ─────────── */}
            {activeTab === "Repository Configuration" && (
              <div className="space-y-5">
                {loadingProjects ? (
                  <span className="inline-flex items-center gap-2 text-xs text-zinc-500">
                    <Loader2 size={12} className="animate-spin" /> Loading...
                  </span>
                ) : !activeProject ? (
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-5 text-xs text-zinc-400">
                    No project selected. Connect one on the{" "}
                    <Link href="/repositories" className="text-indigo-400 hover:text-indigo-300 transition">
                      Repositories
                    </Link>{" "}
                    page.
                  </div>
                ) : (
                  <>
                    <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-white truncate">{activeProject.name}</p>
                          <p className="text-[11px] text-zinc-500 font-mono truncate">
                            {activeProject.repositoryUrl || "No repository URL recorded"}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 flex items-center gap-1 text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${
                            activeProject.isPrivate
                              ? "text-amber-300 bg-amber-500/10 border border-amber-500/20"
                              : "text-zinc-400 bg-zinc-800/60 border border-zinc-800"
                          }`}
                        >
                          {activeProject.isPrivate ? <Lock size={8} /> : <Globe size={8} />}
                          {activeProject.isPrivate ? "Private" : "Public"}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-3 border-t border-zinc-900 pt-3">
                        <div>
                          <span className="text-[10px] uppercase font-bold text-zinc-500 block">Branch</span>
                          <span className="text-xs font-mono text-zinc-300">{activeProject.branch}</span>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase font-bold text-zinc-500 block">Language</span>
                          <span className="text-xs text-zinc-300">{activeProject.language}</span>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase font-bold text-zinc-500 block">Status</span>
                          <span className="text-xs text-zinc-300">{activeProject.status}</span>
                        </div>
                      </div>
                    </div>

                    {/* The branch is read from GitHub, so it is not editable here. */}
                    <p className="text-[10px] text-zinc-600">
                      The tracked branch is the repository&apos;s default branch, read from GitHub at connect
                      time. Aletsch never commits to it directly — generated instrumentation is proposed on a
                      new branch for your review.
                    </p>

                    {syncNote && (
                      <p className="text-[11px] text-zinc-400 rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2">
                        {syncNote}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      <button
                        onClick={syncActiveProject}
                        disabled={syncing}
                        className="inline-flex items-center gap-1.5 bg-indigo-600/10 hover:bg-indigo-600/20 disabled:opacity-50 text-indigo-400 border border-indigo-500/20 rounded-lg px-3.5 py-2 text-xs font-semibold transition cursor-pointer"
                      >
                        {syncing ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <RefreshCw size={12} />
                        )}
                        {syncing ? "Re-analyzing..." : "Re-analyze repository"}
                      </button>
                      <Link
                        href="/repositories"
                        className="text-xs font-semibold text-zinc-400 hover:text-white transition"
                      >
                        Manage repositories
                      </Link>
                      {activeProject.repositoryUrl && (
                        <a
                          href={activeProject.repositoryUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-400 hover:text-white transition"
                        >
                          Open on GitHub <ExternalLink size={11} />
                        </a>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ─────────── Notification preferences ─────────── */}
            {activeTab === "Notification Preferences" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between py-2 border-b border-zinc-900">
                  <div className="pr-4">
                    <span className="text-xs font-medium text-zinc-300 block">In-app anomaly alerts</span>
                    <span className="text-[10px] text-zinc-500">
                      Surface drop-off anomalies on the Alerts page and in the top bar.
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={preferences.alertEmails}
                    onChange={(event) =>
                      setPreferences((current) => ({ ...current, alertEmails: event.target.checked }))
                    }
                    className="accent-indigo-500 cursor-pointer"
                  />
                </div>

                {/* Stated plainly: no mail is sent, so no toggle pretends otherwise. */}
                <div className="flex items-start gap-2 rounded-lg border border-zinc-800 bg-zinc-950/50 px-3.5 py-3 text-[11px] text-zinc-400">
                  <AlertTriangle size={13} className="shrink-0 mt-0.5 text-amber-400" />
                  <span>
                    Email delivery is not configured in this deployment, so alerts are shown in the app only.
                    This preference is stored in your browser.
                  </span>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-zinc-900">
                  <button
                    onClick={savePreferences}
                    className="px-4 py-2 bg-accent hover:bg-accent-hover text-on-accent text-xs font-semibold rounded-lg shadow-md transition cursor-pointer"
                  >
                    {saved ? "Saved" : "Save Preferences"}
                  </button>
                </div>
              </div>
            )}

            {/* ─────────── Security & API access ─────────── */}
            {activeTab === "Security & API Access" && (
              <div className="space-y-6">
                {/* GitHub connection */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <GitBranch size={13} /> GitHub Connection
                  </h4>

                  <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-4 space-y-2">
                    {github === null ? (
                      <span className="inline-flex items-center gap-2 text-xs text-zinc-500">
                        <Loader2 size={12} className="animate-spin" /> Reading connection status...
                      </span>
                    ) : (
                      <>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-xs text-zinc-300">
                            {github.connected ? (
                              <>
                                Connected as{" "}
                                <span className="font-mono text-white">{github.githubLogin}</span>
                              </>
                            ) : (
                              "Not connected"
                            )}
                          </span>
                          <span
                            className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0 ${
                              github.connected
                                ? "text-emerald-400 bg-emerald-500/10"
                                : "text-zinc-400 bg-zinc-800/60"
                            }`}
                          >
                            {github.connected ? "Active" : "Inactive"}
                          </span>
                        </div>

                        <p className="text-[11px] text-zinc-500">Repository access: {modeLabel}</p>

                        {github.scopes.length > 0 && (
                          <p className="text-[11px] text-zinc-500 font-mono">
                            Scopes: {github.scopes.join(", ")}
                          </p>
                        )}

                        {!github.oauthAvailable && github.unavailableReason && (
                          <p className="text-[11px] text-amber-300">{github.unavailableReason}</p>
                        )}

                        {githubNote && <p className="text-[11px] text-zinc-400">{githubNote}</p>}

                        <div className="flex items-center gap-3 pt-1">
                          {github.connected ? (
                            <button
                              onClick={disconnectGitHub}
                              disabled={githubBusy}
                              className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-300 hover:text-rose-200 disabled:opacity-50 transition cursor-pointer"
                            >
                              {githubBusy && <Loader2 size={12} className="animate-spin" />}
                              Disconnect GitHub
                            </button>
                          ) : github.oauthAvailable ? (
                            <a
                              href="/api/github/connect?returnTo=/settings"
                              className="inline-flex items-center gap-1.5 bg-zinc-100 hover:bg-white text-zinc-900 rounded-lg px-3.5 py-2 text-xs font-semibold transition"
                            >
                              <GitBranch size={13} /> Connect GitHub
                            </a>
                          ) : null}
                        </div>
                      </>
                    )}
                  </div>

                  {/* The rule this project is built on, stated where it matters. */}
                  <p className="text-[10px] text-zinc-600">
                    The access token is encrypted at rest and never leaves the server: it is not returned by
                    any API response, not sent to the language model, and not written to logs.
                  </p>
                </div>

                {/* Write key */}
                <div className="space-y-3 pt-5 border-t border-zinc-900">
                  <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Shield size={13} /> Project Write Key
                  </h4>

                  {!activeProject ? (
                    <p className="text-xs text-zinc-500">
                      Select a project under General Settings to view its write key.
                    </p>
                  ) : (
                    <>
                      <p className="text-[11px] text-zinc-500">
                        Identifies <span className="text-zinc-300">{activeProject.name}</span> when your
                        instrumented app posts events. It is publishable — it can only append events to this
                        one project — so shipping it in a client bundle is expected.
                      </p>

                      {keyError && (
                        <p className="flex items-center gap-1.5 text-[11px] text-rose-300">
                          <XCircle size={12} /> {keyError}
                        </p>
                      )}

                      {keyLoading && !writeKey ? (
                        <span className="inline-flex items-center gap-2 text-xs text-zinc-500">
                          <Loader2 size={12} className="animate-spin" /> Loading key...
                        </span>
                      ) : writeKey ? (
                        <div className="space-y-2">
                          <div>
                            <span className="text-[10px] uppercase font-bold text-zinc-500 block mb-1">
                              {writeKey.envVarName || "ALETSCH_WRITE_KEY"}
                            </span>
                            <div className="flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2">
                              <code className="flex-1 text-[11px] font-mono text-zinc-200 truncate">
                                {keyVisible ? writeKey.writeKey : "•".repeat(Math.min(writeKey.writeKey.length, 44))}
                              </code>
                              <button
                                onClick={() => setKeyVisible((visible) => !visible)}
                                title={keyVisible ? "Hide" : "Reveal"}
                                className="shrink-0 p-1.5 rounded-md text-zinc-500 hover:text-white hover:bg-zinc-800 transition cursor-pointer"
                              >
                                {keyVisible ? <EyeOff size={12} /> : <Eye size={12} />}
                              </button>
                              <CopyButton value={writeKey.writeKey} label="write key" />
                            </div>
                          </div>

                          <div>
                            <span className="text-[10px] uppercase font-bold text-zinc-500 block mb-1">
                              Ingest endpoint
                            </span>
                            <div className="flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2">
                              <code className="flex-1 text-[11px] font-mono text-zinc-200 truncate">
                                {writeKey.ingestUrl}
                              </code>
                              <CopyButton value={writeKey.ingestUrl} label="ingest URL" />
                            </div>
                          </div>

                          {writeKey.storage === "in-memory" && (
                            <p className="flex items-center gap-1.5 text-[11px] text-amber-300">
                              <AlertTriangle size={12} /> No database is configured — this key lives in memory
                              and is lost when the server restarts.
                            </p>
                          )}

                          {rotateWarning && (
                            <p className="flex items-start gap-1.5 text-[11px] text-amber-300">
                              <AlertTriangle size={12} className="shrink-0 mt-0.5" /> {rotateWarning}
                            </p>
                          )}

                          <div className="pt-1">
                            {confirmRotate ? (
                              <div className="flex flex-wrap items-center gap-3">
                                <span className="text-[11px] text-zinc-400">
                                  Rotating breaks any deployed build using the old key. Continue?
                                </span>
                                <button
                                  onClick={rotateKey}
                                  disabled={keyLoading}
                                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-300 hover:text-rose-200 disabled:opacity-50 transition cursor-pointer"
                                >
                                  {keyLoading && <Loader2 size={12} className="animate-spin" />}
                                  Yes, rotate
                                </button>
                                <button
                                  onClick={() => setConfirmRotate(false)}
                                  className="text-xs font-semibold text-zinc-500 hover:text-white transition cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmRotate(true)}
                                className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-400 hover:text-white transition cursor-pointer"
                              >
                                <RefreshCw size={12} /> Rotate key
                              </button>
                            )}
                          </div>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>

                {/* Account */}
                <div className="space-y-2 pt-5 border-t border-zinc-900">
                  <h4 className="text-xs font-bold text-white">Account</h4>
                  <p className="text-[11px] text-zinc-500">
                    Sign-in, password and session management are handled by Clerk. Use the avatar menu at the
                    bottom of the sidebar to manage your account.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
