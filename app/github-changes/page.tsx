"use client";
import DashboardLayout from "@/components/navigation/DashboardLayout";
import { GitCommit } from "lucide-react";

export default function GithubChangesPage() {
  return (
    <DashboardLayout>
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <GitCommit size={48} className="text-zinc-700 mb-4" />
        <h1 className="text-xl font-bold text-white mb-2">GitHub Changes</h1>
        <p className="text-sm text-zinc-400 max-w-md">
          This is a placeholder for the upcoming GitHub Changes feature. 
          Monitor commits and track how they impact your analytics.
        </p>
      </div>
    </DashboardLayout>
  );
}
