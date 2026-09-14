"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/navigation/DashboardLayout";
import RepoPicker, { type PickedRepo } from "@/components/repositories/RepoPicker";
import { GitBranch, RefreshCw, Loader2, XCircle, Lock, Globe, BarChart3 } from "lucide-react";

interface Repo {
  id: string;
  projectId: string | null;
  name: string;
  url: string;
  branch: string;
  language: string;
  isPrivate: boolean;
  status: string;
  lastSyncedAt: string | null;
}

/** Colour for a status the pipeline actually set, not a fixed green. */
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
  if (!iso) return "Never synced";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "Never synced";
  const minutes = Math.floor((Date.now() - then) / 60000);
  if (minutes < 1) return "Synced just now";
  if (minutes < 60) return `Synced ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Synced ${hours}h ago`;
  return `Synced ${Math.floor(hours / 24)}d ago`;
}

export default function Repositories() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const loadRepos = useCallback(async () => {
    try {
      const response = await fetch("/api/repositories");
      const data = await response.json().catch(() => []);
      if (!response.ok) {
        setError(data.error || "Repositories could not be loaded.");
        return;
      }
      setError("");
      setRepos(Array.isArray(data) ? data : []);
    } catch {
      setError("Network error while loading repositories.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRepos();
  }, [loadRepos]);

  // The connect pipeline already indexes files and starts the analysis,
  // so this only needs to refresh the list.
  const handleConnected = (_repo: PickedRepo) => {
    loadRepos();
  };

  const handleSync = async (repo: Repo) => {
    if (!repo.projectId) {
      setError("This repository is not linked to a project yet. Reconnect it to enable syncing.");
      return;
    }
    setSyncingId(repo.id);
    setError("");
    try {
      const response = await fetch(`/api/repositories/${repo.projectId}/sync`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "The repository could not be synced.");
      }
      setRepos((current) =>
        current.map((item) => (item.id === repo.id ? { ...item, status: data.status || "Analyzing" } : item))
      );
    } catch (err: any) {
      setError(err.message || "The repository could not be synced.");
    } finally {
      setSyncingId(null);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Repositories</h1>
          <p className="text-sm text-zinc-400">
            Connect a repository and Aletsch maps its pages, components and CTAs. Each connected repository
            is also a{" "}
            <Link href="/projects" className="text-indigo-400 hover:text-indigo-300 transition">
              project
            </Link>
            .
          </p>
        </div>

        <RepoPicker onConnected={handleConnected} returnTo="/repositories" />

        {error && (
          <div className="flex items-center gap-2 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
            <XCircle size={13} className="shrink-0" />
            {error}
          </div>
        )}

        {/* Connected repositories */}
        <div className="space-y-4">
          <h3 className="text-xs uppercase font-bold text-zinc-500 tracking-wider">Connected repositories</h3>

          {loading ? (
            <div className="flex items-center gap-2 text-xs text-zinc-500 py-6">
              <Loader2 size={14} className="animate-spin" /> Loading repositories...
            </div>
          ) : repos.length === 0 ? (
            <div className="glow-card rounded-xl p-8 text-center text-zinc-500 text-xs">
              No repositories connected yet. Pick one above, or paste its URL.
            </div>
          ) : (
            repos.map((repo) => (
              <div
                key={repo.id}
                className="glow-card rounded-xl p-5 glow-cyan flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="p-2 rounded-lg bg-zinc-900 text-zinc-300 shrink-0">
                    <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
                      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-white truncate">{repo.name}</h4>
                      <span
                        className={`flex items-center gap-1 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full shrink-0 ${
                          repo.isPrivate
                            ? "text-amber-300 bg-amber-500/10 border border-amber-500/20"
                            : "text-zinc-400 bg-zinc-800/60 border border-zinc-800"
                        }`}
                      >
                        {repo.isPrivate ? <Lock size={8} /> : <Globe size={8} />}
                        {repo.isPrivate ? "Private" : "Public"}
                      </span>
                    </div>
                    <a
                      href={repo.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[10px] text-zinc-400 font-mono mt-0.5 hover:text-indigo-400 transition block truncate"
                    >
                      {repo.url}
                    </a>
                    <div className="flex items-center gap-3 mt-2 text-[10px] text-zinc-500 font-medium">
                      <span className="flex items-center gap-1">
                        <GitBranch size={10} /> {repo.branch}
                      </span>
                      <span>•</span>
                      <span>{repo.language}</span>
                      <span>•</span>
                      <span>{relativeTime(repo.lastSyncedAt)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 self-end sm:self-center shrink-0">
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusStyle(repo.status)}`}
                  >
                    {repo.status}
                  </span>
                  {repo.projectId && (
                    <Link
                      href={`/projects/${repo.projectId}/analytics`}
                      className="text-xs font-semibold text-zinc-400 hover:text-white transition flex items-center gap-1"
                    >
                      <BarChart3 size={11} /> Analytics
                    </Link>
                  )}
                  <button
                    onClick={() => handleSync(repo)}
                    disabled={syncingId === repo.id}
                    className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition cursor-pointer flex items-center gap-1 disabled:opacity-50"
                  >
                    {syncingId === repo.id ? (
                      <>
                        <Loader2 size={11} className="animate-spin" /> Syncing...
                      </>
                    ) : (
                      <>
                        <RefreshCw size={11} /> Sync now
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
