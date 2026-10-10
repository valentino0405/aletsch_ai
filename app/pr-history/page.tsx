"use client";
import DashboardLayout from "@/components/navigation/DashboardLayout";
import { GitPullRequest } from "lucide-react";

export default function PrHistoryPage() {
  return (
    <DashboardLayout>
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <GitPullRequest size={48} className="text-zinc-700 mb-4" />
        <h1 className="text-xl font-bold text-white mb-2">PR History</h1>
        <p className="text-sm text-zinc-400 max-w-md">
          This is a placeholder for the upcoming PR History feature. 
          Analyze Pull Requests and their corresponding automated instrumentation.
        </p>
      </div>
    </DashboardLayout>
  );
}
