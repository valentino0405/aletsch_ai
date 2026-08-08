"use client";

import { useState } from "react";
import { Search, Bell, GitBranch, Terminal, ShieldAlert, Sparkles } from "lucide-react";

export default function Topbar() {
  const [searchFocused, setSearchFocused] = useState(false);

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
        <div className="flex items-center gap-2 bg-zinc-900/30 border border-zinc-800/80 rounded-lg px-3 py-1.5 text-xs text-zinc-200">
          <Terminal size={14} className="text-indigo-400" />
          <span className="font-semibold">TaskFlow Pro</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-zinc-500 text-[10px]">Connected</span>
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
