"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, Bell, GitBranch, Terminal, ShieldAlert, Sparkles } from "lucide-react";

export default function Topbar() {
  const [searchFocused, setSearchFocused] = useState(false);
  const [projects, setProjects] = useState<Array<{ id?: string; _id?: string; name?: string; status?: string }>>([]);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    fetch("/api/projects")
      .then((response) => (response.ok ? response.json() : []))
      .then((data) => setProjects(Array.isArray(data) ? data : []))
      .catch(() => setProjects([]));
  }, [pathname]);

  const currentProjectId = pathname.match(/^\/projects\/([^/]+)/)?.[1];
  const currentProject = projects.find((project) => (project._id || project.id) === currentProjectId) || projects[0] || null;

  return (
    <header className="h-16 border-b border-zinc-800/60 bg-[#06060c]/80 backdrop-blur-md sticky top-0 z-30 flex items-center justify-between px-6">
      {/* Search Bar */}
      <div className="w-96 max-w-lg relative">
        <Search
          size={16}
          className={`absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors ${
            searchFocused ? "text-indigo-400" : "text-zinc-500"
          }`}
        />
        <input
          type="text"
          placeholder="Search events, users, funnels..."
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          className="w-full h-9 bg-zinc-900/50 hover:bg-zinc-900/80 border border-zinc-800/80 focus:border-indigo-500 rounded-lg pl-10 pr-4 text-xs text-zinc-200 placeholder-zinc-500 outline-none transition-all"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-zinc-500 border border-zinc-800 bg-zinc-950 px-1.5 py-0.5 rounded pointer-events-none">
          ⌘K
        </span>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-4">
        {/* Project select selector */}
        <div className="relative">
          <button
            onClick={() => setProjectMenuOpen((open) => !open)}
            className="flex items-center gap-2 bg-zinc-900/30 border border-zinc-800/80 rounded-lg px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-900/70 transition"
          >
            <Terminal size={14} className="text-indigo-400" />
            <span className="font-semibold max-w-28 truncate">{currentProject?.name || "No project"}</span>
            <span className={`w-1.5 h-1.5 rounded-full ${currentProject ? "bg-emerald-400 animate-pulse" : "bg-zinc-600"}`} />
            <span className="text-zinc-500 text-[10px]">{currentProject?.status || "Disconnected"}</span>
          </button>

          {projectMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl p-1.5 z-50">
              {projects.length > 0 ? (
                <>
                  <p className="px-3 py-2 text-[10px] uppercase font-bold tracking-wider text-zinc-600">Projects</p>
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
                        <span className="text-[10px] text-zinc-600">{project.status || "Connected"}</span>
                      </Link>
                    );
                  })}
                  <div className="border-t border-zinc-800 mt-1 pt-1">
                    <Link href="/projects" onClick={() => setProjectMenuOpen(false)} className="block rounded-lg px-3 py-2.5 text-xs text-indigo-400 hover:bg-zinc-900 transition">
                      + Create new project
                    </Link>
                  </div>
                </>
              ) : (
                <Link href="/projects" onClick={() => setProjectMenuOpen(false)} className="block rounded-lg px-3 py-3 text-xs text-indigo-400 hover:bg-zinc-900 transition">
                  + Create new project
                </Link>
              )}
            </div>
          )}
        </div>

        {/* Sync Status Button */}
        <button className="flex items-center gap-1.5 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 border border-indigo-500/20 rounded-lg px-3 py-1.5 text-xs font-medium transition cursor-pointer">
          <Sparkles size={13} className="animate-spin-slow text-indigo-300" />
          <span>Sync Repository</span>
        </button>

        {/* Notification Bell */}
        <button className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-900/50 transition relative">
          <Bell size={16} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-[#06060c]" />
        </button>
      </div>
    </header>
  );
}
