"use client";

import { useState, useEffect } from "react";
import DashboardLayout from "@/components/navigation/DashboardLayout";
import { GitBranch, Sparkles, AlertCircle, RefreshCw, Loader2, CheckCircle2, XCircle } from "lucide-react";

interface Repo {
  id: string;
  name: string;
  url: string;
  branch: string;
  language: string;
  status: string;
}

export default function Repositories() {
  const [repoUrl, setRepoUrl] = useState("");
  const [branch, setBranch] = useState("main");
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectError, setConnectError] = useState("");
  const [connectedRepos, setConnectedRepos] = useState<Repo[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(true);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  // Load real repos from MongoDB on mount
  useEffect(() => {
    async function loadRepos() {
      try {
        const res = await fetch("/api/repositories");
        if (res.ok) {
          const json = await res.json();
          setConnectedRepos(
            json.map((r: any) => ({
              id: r._id?.toString() || r.id,
              name: r.name || r.repositoryUrl?.split("/").slice(-2).join("/") || "Unknown",
              url: r.repositoryUrl || r.url,
              branch: r.branch || "main",
              language: r.language || "TypeScript",
              status: r.status || "Synced",
            }))
          );
        }
      } catch (err) {
        console.error("Failed to load repositories:", err);
      } finally {
        setLoadingRepos(false);
      }
    }
    loadRepos();
  }, []);

  // Real connect: calls POST /api/repositories
  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setConnectError("");
    setIsConnecting(true);
    try {
      const res = await fetch("/api/repositories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repositoryUrl: repoUrl, branch }),
      });
      const json = await res.json();
      if (!res.ok) {
        setConnectError(json.error || "Failed to connect repository.");
        return;
      }
      // Add to local list immediately
      setConnectedRepos((prev) => [
        ...prev,
        {
          id: json.id,
          name: repoUrl.split("/").slice(-2).join("/"),
          url: repoUrl,
          branch,
          language: json.language || "TypeScript",
          status: "Synced",
        },
      ]);
      setRepoUrl("");
      setBranch("main");

      // Auto-trigger sync/analysis in the background
      if (json.id) {
        fetch(`/api/repositories/${json.id}/sync`, { method: "POST" }).catch(() => {});
      }
    } catch (err: any) {
      setConnectError("Network error. Make sure the dev server is running.");
    } finally {
      setIsConnecting(false);
    }
  };

  // Trigger re-sync for an existing repo
  const handleSync = async (repoId: string) => {
    setSyncingId(repoId);
    try {
      await fetch(`/api/repositories/${repoId}/sync`, { method: "POST" });
      setConnectedRepos((prev) =>
        prev.map((r) => (r.id === repoId ? { ...r, status: "Synced" } : r))
      );
    } catch (err) {
      console.error("Sync failed:", err);
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
            Connect your AI-built applications and let Aletsch AI understand their code structure.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Connection form card */}
          <div className="lg:col-span-1 glow-card rounded-xl p-6 glow-indigo h-fit">
            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
              <svg className="h-4 w-4 text-indigo-400 fill-current" viewBox="0 0 24 24">
                <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
              </svg>
              Connect Repository
            </h3>

            <form onSubmit={handleConnect} className="space-y-4">
              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">
                  GitHub Repository URL
                </label>
                <input
                  type="url"
                  required
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  placeholder="https://github.com/username/project"
                  className="w-full bg-zinc-900 border border-zinc-800 focus:border-indigo-500 rounded-lg px-3.5 py-2 text-xs text-zinc-200 placeholder-zinc-600 outline-none transition"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">
                  Default Branch
                </label>
                <input
                  type="text"
                  required
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  placeholder="main"
                  className="w-full bg-zinc-900 border border-zinc-800 focus:border-indigo-500 rounded-lg px-3.5 py-2 text-xs text-zinc-200 placeholder-zinc-600 outline-none transition"
                />
              </div>

              <div className="p-3 bg-zinc-950/80 border border-zinc-900 rounded-lg flex gap-2 text-[10px] text-zinc-400">
                <AlertCircle size={14} className="text-indigo-400 mt-0.5 shrink-0" />
                <span>
                  Aletsch AI will read the structure of pages, components, and CTAs in this repo to design automated event pipelines.
                </span>
              </div>

              {connectError && (
                <div className="flex items-center gap-2 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
                  <XCircle size={13} />
                  {connectError}
                </div>
              )}

              <button
                type="submit"
                disabled={isConnecting}
                className="w-full flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-700 text-white rounded-lg py-2.5 text-xs font-semibold shadow-md transition cursor-pointer"
              >
                {isConnecting ? (
                  <><Loader2 size={14} className="animate-spin" /> Connecting...</>
                ) : (
                  <><Sparkles size={14} /> Connect Repository</>
                )}
              </button>
            </form>
          </div>

          {/* Connected repos list */}
          <div className="lg:col-span-2 space-y-4">
            <h3 className="text-xs uppercase font-bold text-zinc-500 tracking-wider">
              Connected Repositories
            </h3>

            {loadingRepos ? (
              <div className="flex items-center gap-2 text-xs text-zinc-500 py-6">
                <Loader2 size={14} className="animate-spin" /> Loading repositories...
              </div>
            ) : connectedRepos.length === 0 ? (
              <div className="glow-card rounded-xl p-8 text-center text-zinc-500 text-xs">
                No repositories connected yet. Paste a GitHub URL and click Connect.
              </div>
            ) : (
              connectedRepos.map((repo) => (
                <div
                  key={repo.id}
                  className="glow-card rounded-xl p-5 glow-cyan flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-zinc-900 text-zinc-300">
                      <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
                        <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">{repo.name}</h4>
                      <p className="text-[10px] text-zinc-400 font-mono mt-0.5">{repo.url}</p>
                      <div className="flex items-center gap-3 mt-2 text-[10px] text-zinc-500 font-medium">
                        <span className="flex items-center gap-1">
                          <GitBranch size={10} /> {repo.branch}
                        </span>
                        <span>•</span>
                        <span>{repo.language}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 self-end sm:self-center">
                    <span className="flex items-center gap-1.5 text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      {repo.status}
                    </span>
                    <button
                      onClick={() => handleSync(repo.id)}
                      disabled={syncingId === repo.id}
                      className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition cursor-pointer flex items-center gap-1 disabled:opacity-50"
                    >
                      {syncingId === repo.id ? (
                        <><Loader2 size={11} className="animate-spin" /> Syncing...</>
                      ) : (
                        <><RefreshCw size={11} /> Sync Now</>
                      )}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
