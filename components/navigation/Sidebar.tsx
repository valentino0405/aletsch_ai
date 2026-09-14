"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton, useUser } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  FolderKanban,
  GitBranch,
  Filter,
  Activity,
  Cpu,
  BrainCircuit,
  FileBarChart2,
  Users,
  BellRing,
  Settings,
  Terminal,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
} from "lucide-react";

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

const navItems = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Projects", href: "/projects", icon: FolderKanban },
  { name: "Repositories", href: "/repositories", icon: GitBranch },
  { name: "Funnel Analysis", href: "/funnel-analysis", icon: Filter },
  { name: "Events", href: "/events", icon: Activity },
  { name: "Instrumentation", href: "/instrumentation", icon: Cpu },
  { name: "AI Insights", href: "/insights", icon: BrainCircuit },
  { name: "Reports", href: "/reports", icon: FileBarChart2 },
  { name: "Users", href: "/users", icon: Users },
  { name: "Alerts", href: "/alerts", icon: BellRing },
  { name: "Settings", href: "/settings", icon: Settings },
];

export default function Sidebar({ isOpen, setIsOpen }: SidebarProps) {
  const pathname = usePathname();
  const { user } = useUser();
  const [activeProject, setActiveProject] = useState<any>(null);

  useEffect(() => {
    fetch("/api/projects")
      .then((response) => (response.ok ? response.json() : []))
      .then((projects) => setActiveProject(Array.isArray(projects) ? projects[0] || null : null))
      .catch(() => setActiveProject(null));
  }, [pathname]);

  // The badge reflects the project's real status. A fixed green "Live"
  // would claim a repository is being tracked when it may have failed
  // to analyze or never been connected at all.
  const status: string = activeProject?.status || "";
  const statusTone =
    /^(ready|synced|connected)$/i.test(status)
      ? "text-emerald-400 bg-emerald-500/10"
      : /^(analyzing|syncing|queued)$/i.test(status)
      ? "text-indigo-300 bg-indigo-500/10"
      : /^(error|failed)$/i.test(status)
      ? "text-rose-300 bg-rose-500/10"
      : "text-zinc-400 bg-zinc-800/60";

  return (
    <aside
      className={`fixed top-0 left-0 z-40 h-screen transition-all duration-300 border-r border-zinc-800/60 bg-[#06060c] flex flex-col justify-between ${
        isOpen ? "w-64" : "w-20"
      }`}
    >
      {/* Top Header */}
      <div>
        <div className="h-16 flex items-center justify-between px-4 border-b border-zinc-800/60">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="h-8 w-8 min-w-[32px] rounded-lg bg-gradient-to-tr from-indigo-500 via-purple-500 to-cyan-500 flex items-center justify-center font-bold text-white shadow-md shadow-indigo-500/20">
              A
            </div>
            {isOpen && (
              <div className="flex flex-col">
                <span className="font-bold text-sm tracking-tight text-white">
                  Aletsch AI
                </span>
                <span className="text-[9px] text-zinc-500 font-medium tracking-wide uppercase">
                  Auto-Instrumented
                </span>
              </div>
            )}
          </div>
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="p-1 rounded-md hover:bg-zinc-800/50 text-zinc-400 hover:text-white transition"
          >
            {isOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="p-3 space-y-1.5 overflow-y-auto max-h-[calc(100vh-280px)]">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;

            return (
              <Link
                key={item.name}
                href={item.href}
                className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all relative ${
                  isActive
                    ? "bg-indigo-600/10 text-white border-l-2 border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.15)]"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50"
                }`}
              >
                <Icon
                  size={18}
                  className={`${
                    isActive ? "text-indigo-400" : "text-zinc-500 group-hover:text-zinc-300"
                  } transition-colors`}
                />
                {isOpen && <span>{item.name}</span>}
                {!isOpen && (
                  <div className="absolute left-full ml-2 px-2 py-1 bg-zinc-900 text-white text-xs rounded opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 border border-zinc-800">
                    {item.name}
                  </div>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Bottom Info & User Profile */}
      <div className="p-3 border-t border-zinc-800/60 bg-[#040409]">
        {/* Project Card */}
        {isOpen && (
          <div className="mb-4 p-3 rounded-lg border border-zinc-800/80 bg-zinc-950/40 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-12 h-12 bg-emerald-500/5 rounded-full blur-xl" />
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-zinc-500 font-semibold uppercase">
                Active Project
              </span>
              {activeProject && (
                <span className={`flex items-center gap-1.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${statusTone}`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-current" />
                  {status || "Unknown"}
                </span>
              )}
            </div>
            <h4 className="text-xs font-bold text-white mb-0.5 truncate">{activeProject?.name || "No project connected"}</h4>
            <div className="text-[10px] text-zinc-400 font-mono truncate flex items-center gap-1">
              <Terminal size={10} className="text-zinc-500 shrink-0" /> {activeProject?.repositoryUrl || "Connect a repository"}
            </div>
            <div className="text-[10px] text-zinc-500 mt-1 flex items-center gap-2">
              <span>Branch: <span className="text-zinc-400 font-mono">{activeProject?.branch || "-"}</span></span>
            </div>
            {activeProject?.repositoryUrl ? (
              <a
                href={activeProject.repositoryUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 text-[10px] text-indigo-400 flex items-center gap-1 hover:text-indigo-300 font-medium transition"
              >
                View Repository <ExternalLink size={10} />
              </a>
            ) : (
              // An in-app route, so it must not open in a new tab.
              <Link
                href="/repositories"
                className="mt-2 text-[10px] text-indigo-400 flex items-center gap-1 hover:text-indigo-300 font-medium transition"
              >
                Connect Repository <ChevronRight size={10} />
              </Link>
            )}
          </div>
        )}

        {/* User profile section */}
        <div className="flex items-center justify-between gap-3 px-2 py-1 rounded-lg">
          <div className="flex items-center gap-3 overflow-hidden">
            <UserButton
              appearance={{
                elements: {
                  avatarBox: "h-8 w-8 rounded-full border border-zinc-700",
                },
              }}
            />
            {isOpen && (
              <div className="flex flex-col text-left overflow-hidden">
                <span className="text-xs font-semibold text-white truncate">
                  {user?.fullName || user?.firstName || "Project Owner"}
                </span>
                <span className="text-[10px] text-zinc-500 truncate">
                  Project Owner
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
