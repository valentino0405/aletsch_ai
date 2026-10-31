"use client";
import DashboardLayout from "@/components/navigation/DashboardLayout";
import { Layers } from "lucide-react";

export default function CohortsPage() {
  return (
    <DashboardLayout>
      <div className="glass-surface flex flex-col items-center justify-center h-[60vh] max-w-2xl mx-auto px-10 rounded-3xl text-center">
        <Layers size={48} className="text-indigo-300 mb-4 drop-shadow-[0_0_18px_rgba(129,140,248,.4)]" />
        <h1 className="text-xl font-bold text-white mb-2">Cohorts</h1>
        <p className="text-sm text-zinc-400 max-w-md">
          This is a placeholder for the upcoming Cohorts feature. 
          Group users by behavior and attributes to analyze them over time.
        </p>
      </div>
    </DashboardLayout>
  );
}
