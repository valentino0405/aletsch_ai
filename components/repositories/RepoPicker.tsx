"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Search,
  Loader2,
  Lock,
  Globe,
  Star,
  RefreshCw,
  XCircle,
  Link2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

export interface PickedRepo {
  projectId: string;
  name: string;
  repositoryUrl: string;
  branch: string;
  language: string;
  isPrivate: boolean;
  reconnected: boolean;
  analysisStarted: boolean;
  message: string;
}

interface GitHubRepo {
  fullName: string;
  name: string;
  owner: string;
  url: string;
  defaultBranch: string;
  description: string;
  language: string;
  stars: number;
  isPrivate: boolean;
  pushedAt: string | null;
  canPush: boolean;
}

interface ConnectionStatus {
  connected: boolean;
  githubLogin: string | null;
  mode: string;
  oauthAvailable: boolean;
  unavailableReason?: string;
}

/**
 * Browse-and-connect surface for GitHub repositories.
 *
 * Pasting a URL still works, but it is the fallback rather than the only
 * option: once GitHub is connected, the user picks from their own repos,
 * private ones included. Both paths POST to the same endpoint, so the
 * result is identical either way.
 */
export default function RepoPicker({
  onConnected,
  returnTo,
}: {
  onConnected: (repo: PickedRepo) => void;
  returnTo: string;
}) {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [reposError, setReposError] = useState("");
  const [search, setSearch] = useState("");
  const [visibility, setVisibility] = useState<"all" | "public" | "private">("all");

  const [mode, setMode] = useState<"browse" | "url">("browse");
  const [manualUrl, setManualUrl] = useState("");
  const [manualBranch, setManualBranch] = useState("");

  const [connectingRepo, setConnectingRepo] = useState<string | null>(null);
  const [connectError, setConnectError] = useState("");
  const [notice, setNotice] = useState("");

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const response = await fetch("/api/github/status");
      if (response.ok) {
        setStatus(await response.json());
      } else {
        setStatus(null);
      }
    } catch {
      setStatus(null);
    } finally {
      setStatusLoading(false);
    }
  }, []);

  const loadRepos = useCallback(async () => {
    setReposLoading(true);
    setReposError("");
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (visibility !== "all") params.set("visibility", visibility);

      const response = await fetch(`/api/github/repositories?${params.toString()}`);
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setRepos([]);
        setReposError(data.error || "Your repositories could not be listed.");
        return;
      }
      setRepos(Array.isArray(data.repositories) ? data.repositories : []);
    } catch {
      setRepos([]);
      setReposError("Network error while listing repositories.");
    } finally {
      setReposLoading(false);
    }
  }, [search, visibility]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // Only list repositories once a credential is actually available.
  const canList = Boolean(status && (status.connected || status.mode === "server_pat"));

  useEffect(() => {
    if (!canList) return;
    const timer = window.setTimeout(loadRepos, search ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [canList, loadRepos, search]);

  const connect = async (repositoryUrl: string, branch?: string, key?: string) => {
    setConnectingRepo(key ?? repositoryUrl);
    setConnectError("");
    setNotice("");
    try {
      const response = await fetch("/api/repositories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repositoryUrl, branch }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setConnectError(data.error || "The repository could not be connected.");
        return;
      }

      setNotice(data.message || "Repository connected.");
      setManualUrl("");
      setManualBranch("");
      onConnected({
        projectId: data.projectId || data.id,
        name: data.name,
        repositoryUrl: data.repositoryUrl,
        branch: data.branch,
        language: data.language,
        isPrivate: Boolean(data.isPrivate),
        reconnected: Boolean(data.reconnected),
        analysisStarted: Boolean(data.analysisStarted),
        message: data.message || "",
      });
    } catch {
      setConnectError("Network error. Check that the server is running.");
    } finally {
      setConnectingRepo(null);
    }
  };

  const connectUrl = `/api/github/connect?returnTo=${encodeURIComponent(returnTo)}`;

  return (
    <div className="space-y-4">
      {/* Connection banner */}
      <div className="glow-card rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <svg className="h-5 w-5 text-zinc-300 fill-current shrink-0" viewBox="0 0 24 24">
            <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
          </svg>
          <div className="min-w-0">
            {statusLoading ? (
              <p className="text-xs text-zinc-500 flex items-center gap-1.5">
                <Loader2 size={12} className="animate-spin" /> Checking GitHub connection...
              </p>
            ) : status?.connected ? (
              <>
                <p className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <CheckCircle2 size={12} className="text-emerald-400" />
                  Connected as {status.githubLogin}
                </p>
                <p className="text-[10px] text-zinc-500 mt-0.5">
                  Your public and private repositories are both available below.
                </p>
              </>
            ) : status?.mode === "server_pat" ? (
              <>
                <p className="text-xs font-semibold text-white">Using the server GitHub token</p>
                <p className="text-[10px] text-zinc-500 mt-0.5">
                  Connect your own account to browse and instrument your private repositories.
                </p>
              </>
            ) : (
              <>
                <p className="text-xs font-semibold text-white">GitHub is not connected</p>
                <p className="text-[10px] text-zinc-500 mt-0.5">
                  {status?.oauthAvailable === false
                    ? status.unavailableReason || "GitHub sign-in is not configured on this server."
                    : "Connect your account to pick a repository instead of pasting a URL."}
                </p>
              </>
            )}
          </div>
        </div>

        {!statusLoading && (
          <div className="flex items-center gap-2 shrink-0">
            {status?.connected ? (
              <a
                href={connectUrl}
                className="text-[11px] font-semibold text-zinc-400 hover:text-white transition px-3 py-1.5 rounded-lg border border-zinc-800 hover:border-zinc-700"
              >
                Reconnect
              </a>
            ) : status?.oauthAvailable !== false ? (
              <a
                href={connectUrl}
                className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-3.5 py-2 text-xs font-semibold shadow-md transition"
              >
                <Link2 size={13} /> Connect GitHub
              </a>
            ) : null}
          </div>
        )}
      </div>

      {/* Mode switch */}
      <div className="flex items-center gap-1 p-1 rounded-lg bg-zinc-950/60 border border-zinc-900 w-fit">
        <button
          onClick={() => setMode("browse")}
          className={`px-3 py-1.5 rounded-md text-[11px] font-semibold transition cursor-pointer ${
            mode === "browse" ? "bg-indigo-600/15 text-indigo-300" : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          Browse my repositories
        </button>
        <button
          onClick={() => setMode("url")}
          className={`px-3 py-1.5 rounded-md text-[11px] font-semibold transition cursor-pointer ${
            mode === "url" ? "bg-indigo-600/15 text-indigo-300" : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          Paste a URL
        </button>
      </div>

      {connectError && (
        <div className="flex items-center gap-2 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
          <XCircle size={13} className="shrink-0" />
          {connectError}
        </div>
      )}
      {notice && (
        <div className="flex items-center gap-2 text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
          <CheckCircle2 size={13} className="shrink-0" />
          {notice}
        </div>
      )}

      {mode === "url" ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            connect(manualUrl, manualBranch.trim() || undefined, "manual");
          }}
          className="glow-card rounded-xl p-5 space-y-4"
        >
          <div>
            <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">
              GitHub repository URL
            </label>
            <input
              type="text"
              required
              value={manualUrl}
              onChange={(event) => setManualUrl(event.target.value)}
              placeholder="https://github.com/username/project"
              className="w-full bg-zinc-900 border border-zinc-800 focus:border-indigo-500 rounded-lg px-3.5 py-2 text-xs text-zinc-200 placeholder-zinc-600 outline-none transition"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">
              Branch <span className="text-zinc-600 normal-case font-medium">(optional)</span>
            </label>
            <input
              type="text"
              value={manualBranch}
              onChange={(event) => setManualBranch(event.target.value)}
              placeholder="Leave empty to use the repository's default branch"
              className="w-full bg-zinc-900 border border-zinc-800 focus:border-indigo-500 rounded-lg px-3.5 py-2 text-xs text-zinc-200 placeholder-zinc-600 outline-none transition"
            />
          </div>
          <div className="p-3 bg-zinc-950/80 border border-zinc-900 rounded-lg flex gap-2 text-[10px] text-zinc-400">
            <AlertCircle size={14} className="text-indigo-400 mt-0.5 shrink-0" />
            <span>
              Aletsch reads the structure of pages, components and CTAs in this repository to design an
              event plan. Nothing is committed without your approval.
            </span>
          </div>
          <button
            type="submit"
            disabled={connectingRepo === "manual"}
            className="w-full flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-700 text-white rounded-lg py-2.5 text-xs font-semibold shadow-md transition cursor-pointer"
          >
            {connectingRepo === "manual" ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Connecting...
              </>
            ) : (
              <>
                <Link2 size={14} /> Connect repository
              </>
            )}
          </button>
        </form>
      ) : !canList ? (
        <div className="glow-card rounded-xl p-8 text-center">
          <p className="text-xs text-zinc-400">
            {status?.oauthAvailable === false
              ? "Repository browsing needs GitHub sign-in configured on the server."
              : "Connect your GitHub account to browse your repositories."}
          </p>
          <button
            onClick={() => setMode("url")}
            className="mt-3 text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 transition cursor-pointer"
          >
            Paste a URL instead
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Search + filters */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={14} />
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search your repositories..."
                className="w-full bg-zinc-950/40 border border-zinc-800 focus:border-indigo-500 rounded-lg pl-9 pr-4 py-2 text-xs text-zinc-200 placeholder-zinc-600 outline-none transition"
              />
            </div>
            <div className="flex items-center gap-1 p-1 rounded-lg bg-zinc-950/60 border border-zinc-900">
              {(["all", "public", "private"] as const).map((value) => (
                <button
                  key={value}
                  onClick={() => setVisibility(value)}
                  className={`px-2.5 py-1.5 rounded-md text-[11px] font-semibold capitalize transition cursor-pointer ${
                    visibility === value ? "bg-indigo-600/15 text-indigo-300" : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
            <button
              onClick={loadRepos}
              disabled={reposLoading}
              className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white transition cursor-pointer disabled:opacity-50"
              aria-label="Refresh repository list"
            >
              <RefreshCw size={14} className={reposLoading ? "animate-spin" : ""} />
            </button>
          </div>

          {reposError && (
            <div className="flex items-center gap-2 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
              <XCircle size={13} className="shrink-0" />
              {reposError}
            </div>
          )}

          {/* Repo list */}
          <div className="glow-card rounded-xl divide-y divide-zinc-900 max-h-[420px] overflow-y-auto">
            {reposLoading && repos.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-12 text-xs text-zinc-500">
                <Loader2 size={14} className="animate-spin" /> Loading your repositories...
              </div>
            ) : repos.length === 0 ? (
              <div className="py-12 text-center text-xs text-zinc-500">
                {search ? `No repository matches "${search}".` : "No repositories were returned for this account."}
              </div>
            ) : (
              repos.map((repo) => (
                <div
                  key={repo.fullName}
                  className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-zinc-950/40 transition"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-white truncate">{repo.fullName}</span>
                      <span
                        className={`flex items-center gap-1 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${
                          repo.isPrivate
                            ? "text-amber-300 bg-amber-500/10 border border-amber-500/20"
                            : "text-zinc-400 bg-zinc-800/60 border border-zinc-800"
                        }`}
                      >
                        {repo.isPrivate ? <Lock size={8} /> : <Globe size={8} />}
                        {repo.isPrivate ? "Private" : "Public"}
                      </span>
                    </div>
                    {repo.description && (
                      <p className="text-[10px] text-zinc-500 mt-0.5 truncate">{repo.description}</p>
                    )}
                    <div className="flex items-center gap-2.5 mt-1 text-[10px] text-zinc-600">
                      {repo.language && repo.language !== "Unknown" && <span>{repo.language}</span>}
                      <span className="flex items-center gap-0.5">
                        <Star size={9} /> {repo.stars}
                      </span>
                      <span className="font-mono">{repo.defaultBranch}</span>
                      {!repo.canPush && (
                        <span className="text-amber-500/80" title="Aletsch cannot open a pull request here">
                          read-only
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => connect(repo.url, repo.defaultBranch, repo.fullName)}
                    disabled={connectingRepo !== null}
                    className="shrink-0 flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-700 disabled:opacity-60 text-white rounded-lg px-3 py-1.5 text-[11px] font-semibold transition cursor-pointer"
                  >
                    {connectingRepo === repo.fullName ? (
                      <>
                        <Loader2 size={12} className="animate-spin" /> Connecting
                      </>
                    ) : (
                      "Connect"
                    )}
                  </button>
                </div>
              ))
            )}
          </div>

          {repos.length > 0 && (
            <p className="text-[10px] text-zinc-600 text-center">
              Showing {repos.length} repositor{repos.length === 1 ? "y" : "ies"}
              {visibility !== "all" ? ` (${visibility})` : ""}. Not listed?{" "}
              <button
                onClick={() => setMode("url")}
                className="text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer"
              >
                Paste its URL
              </button>
              .
            </p>
          )}
        </div>
      )}
    </div>
  );
}
