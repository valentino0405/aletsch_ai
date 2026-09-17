"use client";
import DashboardLayout from "@/components/navigation/DashboardLayout";
import { Layers } from "lucide-react";

export default function CohortsPage() {
  return (
    <DashboardLayout>
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <Layers size={48} className="text-zinc-700 mb-4" />
        <h1 className="text-xl font-bold text-white mb-2">Cohorts</h1>
        <p className="text-sm text-zinc-400 max-w-md">
          This is a placeholder for the upcoming Cohorts feature. 
          Group users by behavior and attributes to analyze them over time.
        </p>
      </div>
    </DashboardLayout>
  );
}
