"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/navigation/DashboardLayout";
import RepoPicker, { type PickedRepo } from "@/components/repositories/RepoPicker";
import {
  Terminal,
  Sparkles,
  Plus,
  RefreshCw,
  Loader2,
  X,
  Lock,
  Globe,
  XCircle,
} from "lucide-react";

interface Project {
  id: string;
  name: string;
  language: string;
  repositoryUrl: string;
  repositoryLabel: string;
  branch: string;
  isPrivate: boolean;
  status: string;
  updatedAt: string | null;
  eventCount: number;
  userCount: number;
}

function statusStyle(status: string): string {
  const value = status.toLowerCase();
  if (value === "ready" || value === "synced" || value === "connected") {
    return "text-emerald-400 bg-emerald-500/10";
  }
  if (value === "analyzing" || value === "syncing" || value === "queued") {
    return "text-indigo-300 bg-indigo-500/10";
  }
  if (value === "error" || value === "failed") return "text-rose-300 bg-rose-500/10";
  return "text-zinc-400 bg-zinc-800/60";
}

function relativeTime(iso: string | null): string {
  if (!iso) return "Not yet analyzed";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "Not yet analyzed";
  const minutes = Math.floor((Date.now() - then) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Strips the scheme for display without assuming one is present. */
function repositoryLabel(url: unknown): string {
  if (typeof url !== "string" || !url) return "No repository linked";
  return url.replace(/^https?:\/\//, "");
}

export default function Projects() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const loadProjects = useCallback(async () => {
    try {
      const response = await fetch("/api/projects");
      const data = await response.json().catch(() => []);
      if (!response.ok) {
        setError(data.error || "Projects could not be loaded.");
        return;
      }
      setError("");
      setProjects(
        (Array.isArray(data) ? data : []).map((project: any) => ({
          id: project._id || project.id,
          name: project.name || "Unnamed project",
          // Language comes from GitHub at connect time. When it is
          // missing the project simply has not been analyzed yet.
          language: project.language || "Unknown",
          repositoryUrl: project.repositoryUrl || "",
          repositoryLabel: repositoryLabel(project.repositoryUrl),
          branch: project.branch || "main",
          isPrivate: Boolean(project.isPrivate),
          status: project.status || "Unknown",
          updatedAt: project.lastAnalyzedAt || project.updatedAt || null,
          eventCount: typeof project.eventCount === "number" ? project.eventCount : 0,
          userCount: typeof project.userCount === "number" ? project.userCount : 0,
        }))
      );
    } catch {
      setError("Network error while loading projects.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const handleConnected = (repo: PickedRepo) => {
    setShowAddModal(false);
    loadProjects();
    router.push(`/projects/${repo.projectId}/analytics`);
  };

  const handleSync = async (projectId: string) => {
    setSyncingId(projectId);
    setError("");
    try {
      const response = await fetch(`/api/repositories/${projectId}/sync`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "The project could not be synced.");
      }
      setProjects((current) =>
        current.map((project) =>
          project.id === projectId ? { ...project, status: data.status || "Analyzing" } : project
        )
      );
    } catch (err: any) {
      setError(err.message || "The project could not be synced.");
    } finally {
      setSyncingId(null);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Projects</h1>
            <p className="text-sm text-zinc-400">
              Every project is a connected GitHub repository. Manage the GitHub side on the{" "}
              <Link href="/repositories" className="text-indigo-400 hover:text-indigo-300 transition">
                Repositories
              </Link>{" "}
              page.
            </p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 bg-accent hover:bg-accent-hover text-on-accent rounded-lg px-4 py-2 text-xs font-semibold shadow-md shadow-indigo-600/10 transition cursor-pointer"
          >
            <Plus size={16} />
            <span>Connect repository</span>
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-xs text-rose-300">
            <XCircle size={13} className="shrink-0" />
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-xs text-zinc-500 py-8">
            <Loader2 size={14} className="animate-spin" /> Loading projects...
          </div>
        ) : projects.length === 0 ? (
          <div className="glow-card rounded-xl p-10 text-center">
            <p className="text-sm text-zinc-400">No projects yet.</p>
            <p className="text-xs text-zinc-500 mt-1">
              Connect a GitHub repository and Aletsch will map its components and propose an event plan.
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className="mt-4 inline-flex items-center gap-1.5 bg-accent hover:bg-accent-hover text-on-accent rounded-lg px-4 py-2 text-xs font-semibold transition cursor-pointer"
            >
              <Plus size={14} /> Connect repository
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {projects.map((project) => (
              <div
                key={project.id}
                className="glow-card rounded-xl p-6 glow-indigo relative overflow-hidden flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-4 gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-[10px] bg-zinc-800 text-zinc-300 font-mono px-2 py-0.5 rounded shrink-0">
                        {project.language}
                      </span>
                      <span
                        className={`flex items-center gap-1 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full shrink-0 ${
                          project.isPrivate
                            ? "text-amber-300 bg-amber-500/10 border border-amber-500/20"
                            : "text-zinc-400 bg-zinc-800/60 border border-zinc-800"
                        }`}
                      >
                        {project.isPrivate ? <Lock size={8} /> : <Globe size={8} />}
                        {project.isPrivate ? "Private" : "Public"}
                      </span>
                    </div>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${statusStyle(
                        project.status
                      )}`}
                    >
                      {project.status}
                    </span>
                  </div>

                  <h3 className="text-lg font-bold text-white mb-1 truncate">{project.name}</h3>
                  <p className="text-xs text-zinc-400 font-mono flex items-center gap-1 mb-1">
                    <Terminal size={12} className="text-zinc-500 shrink-0" />
                    <span className="truncate">{project.repositoryLabel}</span>
                  </p>
                  <p className="text-[10px] text-zinc-600 font-mono mb-6">branch: {project.branch}</p>

                  <div className="grid grid-cols-3 gap-4 border-t border-zinc-900 pt-4">
                    <div>
                      <span className="text-[10px] text-zinc-500 uppercase font-bold block">Users</span>
                      <span className="text-sm font-semibold text-white mt-1 block">
                        {project.userCount.toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-zinc-500 uppercase font-bold block">Events</span>
                      <span className="text-sm font-semibold text-white mt-1 block">
                        {project.eventCount.toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-zinc-500 uppercase font-bold block">Updated</span>
                      <span className="text-xs font-semibold text-zinc-300 mt-1.5 block">
                        {relativeTime(project.updatedAt)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                  <button
                    onClick={() => handleSync(project.id)}
                    disabled={syncingId === project.id}
                    className="flex items-center gap-1 text-xs font-semibold text-zinc-400 hover:text-white transition cursor-pointer disabled:opacity-50"
                  >
                    {syncingId === project.id ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <RefreshCw size={12} />
                    )}
                    {syncingId === project.id ? "Syncing..." : "Sync"}
                  </button>
                  <Link
                    href={`/projects/${project.id}/analytics`}
                    className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition flex items-center gap-1"
                  >
                    View analytics <Sparkles size={12} className="text-indigo-300" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Connect modal — the same picker the Repositories page uses. */}
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8 bg-black/60 backdrop-blur-sm">
            <div className="max-w-2xl w-full p-6 rounded-2xl border border-zinc-800 bg-card-dark shadow-2xl relative my-auto">
              <button
                onClick={() => setShowAddModal(false)}
                className="absolute top-4 right-4 text-zinc-500 hover:text-white transition cursor-pointer"
                aria-label="Close"
              >
                <X size={16} />
              </button>
              <h2 className="text-lg font-bold text-white mb-1">Connect a repository</h2>
              <p className="text-xs text-zinc-400 mb-5">
                Pick one of your GitHub repositories, or paste a URL. Aletsch indexes its source and starts an
                analysis straight away.
              </p>
              <RepoPicker onConnected={handleConnected} returnTo="/projects" />
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
