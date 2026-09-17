"use client";
import DashboardLayout from "@/components/navigation/DashboardLayout";
import { Code2 } from "lucide-react";

export default function CodeIntelligencePage() {
  return (
    <DashboardLayout>
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <Code2 size={48} className="text-zinc-700 mb-4" />
        <h1 className="text-xl font-bold text-white mb-2">Code Intelligence</h1>
        <p className="text-sm text-zinc-400 max-w-md">
          This is a placeholder for the upcoming Code Intelligence feature. 
          Deep AST analysis and context tracking will be available here.
        </p>
      </div>
    </DashboardLayout>
  );
}
