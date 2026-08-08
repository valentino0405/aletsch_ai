"use client";

import { useState } from "react";
import DashboardLayout from "@/components/navigation/DashboardLayout";
import { FolderKanban, Terminal, Sparkles, Plus, CheckCircle2, RefreshCw } from "lucide-react";

export default function Projects() {
  const [projects, setProjects] = useState([
    {
      id: "1",
      name: "TaskFlow Pro",
      framework: "Next.js",
      repositoryUrl: "github.com/example/taskflow",
      status: "Connected",
      lastAnalyzed: "Today",
      events: "24.7K",
      users: "8,642",
    },
    {
      id: "2",
      name: "E-Shop Client",
      framework: "React SPA",
      repositoryUrl: "github.com/example/eshop",
      status: "Connected",
      lastAnalyzed: "2 days ago",
      events: "112.5K",
      users: "31,200",
    },
  ]);

  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [branch, setBranch] = useState("main");
  const [loading, setLoading] = useState(false);

  const handleAddProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Call local route handler
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, repositoryUrl: repoUrl, branch }),
      });
      const data = await res.json();
      if (res.ok) {
        setProjects([
          ...projects,
          {
            id: data.id || Math.random().toString(),
            name,
            framework: "Next.js",
            repositoryUrl: repoUrl.replace("https://", ""),
            status: "Connected",
            lastAnalyzed: "Just Now",
            events: "0",
            users: "0",
          },
        ]);
        setName("");
        setRepoUrl("");
        setBranch("main");
        setShowAddModal(false);
      } else {
        alert(data.error || "Failed to add project to MongoDB.");
      }
    } catch (err) {
      console.error(err);
      // Fallback update in case MongoDB is not configured in local environment
      setProjects([
        ...projects,
        {
          id: Math.random().toString(),
          name,
          framework: "Next.js",
          repositoryUrl: repoUrl.replace("https://", ""),
          status: "Connected",
          lastAnalyzed: "Just Now",
          events: "0",
          users: "0",
        },
      ]);
      setName("");
      setRepoUrl("");
      setBranch("main");
      setShowAddModal(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Projects</h1>
            <p className="text-sm text-zinc-400">
              Manage and connect the applications you want Aletsch AI to automatically instrument.
            </p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-4 py-2 text-xs font-semibold shadow-md shadow-indigo-600/10 transition cursor-pointer"
          >
            <Plus size={16} />
            <span>Add Project</span>
          </button>
        </div>

        {/* Project Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {projects.map((project) => (
            <div
              key={project.id}
              className="glow-card rounded-xl p-6 glow-indigo relative overflow-hidden flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[10px] bg-zinc-800 text-zinc-300 font-mono px-2 py-0.5 rounded">
                    {project.framework}
                  </span>
                  <span className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse-glow" />
                    {project.status}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-white mb-1">{project.name}</h3>
                <p className="text-xs text-zinc-400 font-mono flex items-center gap-1 mb-6">
                  <Terminal size={12} className="text-zinc-500" />
                  {project.repositoryUrl}
                </p>

                <div className="grid grid-cols-3 gap-4 border-t border-zinc-900 pt-4">
                  <div>
                    <span className="text-[10px] text-zinc-500 uppercase font-bold block">
                      Users
                    </span>
                    <span className="text-sm font-semibold text-white mt-1 block">
                      {project.users}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-500 uppercase font-bold block">
                      Events
                    </span>
                    <span className="text-sm font-semibold text-white mt-1 block">
                      {project.events}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-500 uppercase font-bold block">
                      Analyzed
                    </span>
                    <span className="text-xs font-semibold text-zinc-300 mt-1.5 block">
                      {project.lastAnalyzed}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button className="flex items-center gap-1 text-xs font-semibold text-zinc-400 hover:text-white transition cursor-pointer">
                  <RefreshCw size={12} /> Sync
                </button>
                <button className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition flex items-center gap-1 cursor-pointer">
                  View Analytics <Sparkles size={12} className="text-indigo-300" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Add Project Modal */}
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="max-w-md w-full p-6 rounded-2xl border border-zinc-800 bg-[#09090f] shadow-2xl relative overflow-hidden">
              <h2 className="text-lg font-bold text-white mb-2">Connect New Project</h2>
              <p className="text-xs text-zinc-400 mb-4">
                Input your repository configuration. Aletsch AI will sync with your MongoDB settings.
              </p>

              <form onSubmit={handleAddProject} className="space-y-4">
                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">
                    Project Name
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. TaskFlow Pro"
                    className="w-full bg-zinc-900 border border-zinc-800 focus:border-indigo-500 rounded-lg px-3.5 py-2 text-xs text-zinc-200 placeholder-zinc-600 outline-none transition"
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">
                    GitHub URL
                  </label>
                  <input
                    type="url"
                    required
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    placeholder="e.g. https://github.com/username/repo"
                    className="w-full bg-zinc-900 border border-zinc-800 focus:border-indigo-500 rounded-lg px-3.5 py-2 text-xs text-zinc-200 placeholder-zinc-600 outline-none transition"
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">
                    Branch Name
                  </label>
                  <input
                    type="text"
                    required
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    placeholder="e.g. main"
                    className="w-full bg-zinc-900 border border-zinc-800 focus:border-indigo-500 rounded-lg px-3.5 py-2 text-xs text-zinc-200 placeholder-zinc-600 outline-none transition"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-zinc-900">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-white transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-md transition cursor-pointer"
                  >
                    {loading ? "Connecting..." : "Add Project"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
