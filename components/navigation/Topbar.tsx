"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Search, Bell, Terminal, Loader2, RefreshCw, Check } from "lucide-react";

interface Project {
  _id?: string;
  id?: string;
  name?: string;
  status?: string;
}

function statusTone(status: string): string {
  if (/^(ready|synced|connected)$/i.test(status)) return "bg-emerald-400";
  if (/^(analyzing|syncing|queued)$/i.test(status)) return "bg-indigo-400 animate-pulse";
  if (/^(error|failed)$/i.test(status)) return "bg-rose-400";
  return "bg-zinc-600";
}

export default function Topbar({ preview = false }: { preview?: boolean }) {
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [projects, setProjects] = useState<Project[]>(preview ? [{ id: "sample-storefront", name: "Sample Storefront", status: "Ready" }] : []);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncNote, setSyncNote] = useState("");
  const [alertCount, setAlertCount] = useState(0);

  const searchRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (preview) {
      setProjects([{ id: "sample-storefront", name: "Sample Storefront", status: "Ready" }]);
      return;
    }
    fetch("/api/projects")
      .then((response) => (response.ok ? response.json() : []))
      .then((data) => setProjects(Array.isArray(data) ? data : []))
      .catch(() => setProjects([]));

    // The bell only shows a dot when alerts actually exist.
    fetch("/api/alerts")
      .then((response) => (response.ok ? response.json() : []))
      .then((data) => setAlertCount(Array.isArray(data) ? data.length : 0))
      .catch(() => setAlertCount(0));
  }, [pathname, preview]);

  // ⌘K / Ctrl+K focuses search, matching the hint shown in the field.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Close the project menu on an outside click rather than trapping it open.
  useEffect(() => {
    if (!projectMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setProjectMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [projectMenuOpen]);

  const currentProjectId = pathname.match(/^\/projects\/([^/]+)/)?.[1];
  const currentProject = preview ? projects[0] || null :
    projects.find((project) => (project._id || project.id) === currentProjectId) || projects[0] || null;

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const term = searchTerm.trim();
    if (!term) return;
    // Events Explorer is the surface that actually queries event names.
    router.push(`/events?search=${encodeURIComponent(term)}`);
  };

  const syncCurrentProject = async () => {
    const id = currentProject?._id || currentProject?.id;
    if (!id) {
      setSyncNote("No project");
      window.setTimeout(() => setSyncNote(""), 2500);
      return;
    }
    setSyncing(true);
    setSyncNote("");
    try {
      const response = await fetch(`/api/repositories/${id}/sync`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      setSyncNote(response.ok ? "Sync started" : data.error ? "Sync failed" : "Sync failed");
    } catch {
      setSyncNote("Sync failed");
    } finally {
      setSyncing(false);
      window.setTimeout(() => setSyncNote(""), 3000);
    }
  };

  return (
    <header className="app-topbar flex min-w-0 flex-1 items-center px-3 py-3 sm:px-6 lg:px-9">
      <div className="topbar-glass flex min-h-12 w-full min-w-0 flex-wrap items-center justify-between gap-2 rounded-2xl p-2 sm:flex-nowrap sm:px-4">
        {/* Search */}
        <form onSubmit={submitSearch} className="topbar-search relative min-w-0 w-full sm:max-w-md sm:flex-1">
          <Search
            size={16}
            className={`absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors ${
              searchFocused ? "text-indigo-400" : "text-zinc-500"
            }`}
          />
          <input
            ref={searchRef}
            type="text"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search events by name..."
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            className="w-full h-9 bg-white/[0.035] hover:bg-white/[0.06] border border-white/[0.07] focus:border-indigo-400/40 rounded-xl pl-10 pr-14 text-xs text-zinc-200 placeholder-zinc-500 outline-none transition-all"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-zinc-500 border border-zinc-800 bg-zinc-950 px-1.5 py-0.5 rounded pointer-events-none">
            ⌘K
          </span>
        </form>

        {/* Right controls */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
          {/* Project selector */}
          <div className="relative" ref={menuRef}>
            <button
              aria-label="Choose project"
              aria-expanded={projectMenuOpen}
              onClick={() => setProjectMenuOpen((open) => !open)}
              className="flex items-center gap-2 bg-white/[0.035] border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-zinc-200 hover:bg-white/[0.07] hover:border-white/[0.14] transition cursor-pointer"
            >
            <Terminal size={14} className="text-indigo-400" />
            <span className="font-semibold max-w-28 truncate">{currentProject?.name || "No project"}</span>
            <span className={`w-1.5 h-1.5 rounded-full ${statusTone(currentProject?.status || "")}`} />
            <span className="hidden text-zinc-500 text-[10px] md:inline">
              {currentProject ? currentProject.status || "Unknown" : "Not connected"}
            </span>
            </button>

          {projectMenuOpen && (
            <div className="glass-popover absolute right-0 top-full mt-2 w-64 rounded-2xl shadow-2xl p-1.5 z-50">
              {projects.length > 0 ? (
                <>
                  <p className="px-3 py-2 text-[10px] uppercase font-bold tracking-wider text-zinc-600">
                    Projects
                  </p>
                  {projects.map((project) => {
                    const id = project._id || project.id;
                    return (
                      <Link
                        key={id}
                        href={id ? `/projects/${id}/analytics` : "/projects"}
                        onClick={() => setProjectMenuOpen(false)}
                        className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-xs transition ${
                          id === (currentProject?._id || currentProject?.id)
                            ? "bg-indigo-600/15 text-indigo-300"
                            : "text-zinc-300 hover:bg-zinc-900 hover:text-white"
                        }`}
                      >
                        <span className="truncate">{project.name || "Unnamed project"}</span>
                        <span className="text-[10px] text-zinc-600 shrink-0">
                          {project.status || "Unknown"}
                        </span>
                      </Link>
                    );
                  })}
                  <div className="border-t border-zinc-800 mt-1 pt-1">
                    <Link
                      href="/projects"
                      onClick={() => setProjectMenuOpen(false)}
                      className="block rounded-lg px-3 py-2.5 text-xs text-indigo-400 hover:bg-zinc-900 transition"
                    >
                      + Connect a repository
                    </Link>
                  </div>
                </>
              ) : (
                <Link
                  href="/projects"
                  onClick={() => setProjectMenuOpen(false)}
                  className="block rounded-lg px-3 py-3 text-xs text-indigo-400 hover:bg-zinc-900 transition"
                >
                  + Connect a repository
                </Link>
              )}
            </div>
          )}
          </div>

        {/* Sync the active project */}
          <button
          onClick={syncCurrentProject}
          disabled={syncing || !currentProject || preview}
          aria-label={syncNote || (syncing ? "Syncing repository" : "Sync repository")}
          title={currentProject ? `Re-sync ${currentProject.name}` : "Connect a repository first"}
          className="flex items-center gap-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed text-indigo-300 border border-indigo-400/20 rounded-xl px-3 py-2 text-xs font-medium transition cursor-pointer"
        >
          {syncing ? (
            <Loader2 size={13} className="animate-spin" />
          ) : syncNote === "Sync started" ? (
            <Check size={13} className="text-emerald-400" />
          ) : (
            <RefreshCw size={13} />
          )}
          <span className="hidden lg:inline">{syncNote || (syncing ? "Syncing..." : "Sync Repository")}</span>
          </button>

        {/* Alerts */}
          <Link
          href="/alerts"
          className="p-2.5 text-zinc-400 hover:text-white rounded-xl hover:bg-white/[0.06] transition relative block"
          title={alertCount > 0 ? `${alertCount} active alert${alertCount === 1 ? "" : "s"}` : "No active alerts"}
        >
          <Bell size={16} />
          {alertCount > 0 && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-[#06060c]" />
          )}
          </Link>
        </div>
      </div>
    </header>
  );
}
