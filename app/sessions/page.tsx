"use client";
import DashboardLayout from "@/components/navigation/DashboardLayout";
import { Clock } from "lucide-react";

export default function SessionsPage() {
  return (
    <DashboardLayout>
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <Clock size={48} className="text-zinc-700 mb-4" />
        <h1 className="text-xl font-bold text-white mb-2">Sessions</h1>
        <p className="text-sm text-zinc-400 max-w-md">
          This is a placeholder for the upcoming Sessions feature. 
          Session replay and duration metrics will be available here.
        </p>
      </div>
    </DashboardLayout>
  );
}
