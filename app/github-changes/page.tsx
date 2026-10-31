"use client";
import DashboardLayout from "@/components/navigation/DashboardLayout";
import { GitCommit } from "lucide-react";

export default function GithubChangesPage() {
  return (
    <DashboardLayout>
      <div className="glass-surface flex flex-col items-center justify-center h-[60vh] max-w-2xl mx-auto px-10 rounded-3xl text-center">
        <GitCommit size={48} className="text-indigo-300 mb-4 drop-shadow-[0_0_18px_rgba(129,140,248,.4)]" />
        <h1 className="text-xl font-bold text-white mb-2">GitHub Changes</h1>
        <p className="text-sm text-zinc-400 max-w-md">
          This is a placeholder for the upcoming GitHub Changes feature. 
          Monitor commits and track how they impact your analytics.
        </p>
      </div>
    </DashboardLayout>
  );
}
