"use client";

import DashboardLayout from "@/components/navigation/DashboardLayout";
import { Cpu, CheckCircle2, ChevronRight, Terminal, Sparkles, FileCode, Play } from "lucide-react";

export default function Instrumentation() {
  const steps = [
    { title: "Repository Sync", desc: "Cloning application components tree" },
    { title: "Code Analysis", desc: "Parsing AST structures & files hierarchy" },
    { title: "Intent Detection", desc: "AI maps buttons, forms, and pages purposes" },
    { title: "Event Generation", desc: "Synthesizing custom interaction tracking schema" },
    { title: "Auto Injection", desc: "Injecting telemetry middleware directly to repo" },
  ];

  const detectedComponents = [
    { name: "Dashboard.tsx", type: "Page Layout", status: "Instrumented", progress: "100%", events: ["Page View", "Date Picker Toggle"] },
    { name: "LoginForm.tsx", type: "Form Block", status: "Instrumented", progress: "100%", events: ["Form Submission", "Oauth Initiated"] },
    { name: "ConnectRepositoryButton.tsx", type: "CTA Button", status: "Instrumented", progress: "100%", events: ["CTA Click"] },
    { name: "AnalyzeButton.tsx", type: "User Interaction", status: "Syncing", progress: "60%", events: ["Trigger Click"] },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Auto-Instrumentation</h1>
          <p className="text-sm text-zinc-400">
            Aletsch AI reads and maps your codebase to inject analytics telemetry automatically.
          </p>
        </div>

        {/* Big Pipeline Visual Map */}
        <div className="glow-card rounded-xl p-6 glow-cyan relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/5 rounded-full blur-2xl" />
          <h3 className="text-sm font-bold text-white mb-6">Auto-Instrumentation Workflow</h3>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            {steps.map((st, idx) => (
              <div key={st.title} className="flex-1 flex flex-col md:flex-row md:items-center gap-3">
                <div className="flex flex-col p-4 rounded-xl border border-zinc-800/80 bg-zinc-950/40 relative z-10 w-full">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[9px] font-mono font-bold text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded">
                      0{idx + 1}
                    </span>
                    <span className="text-xs font-bold text-white">{st.title}</span>
                  </div>
                  <p className="text-[10px] text-zinc-500 leading-normal">{st.desc}</p>
                </div>
                {idx < steps.length - 1 && (
                  <ChevronRight className="hidden md:block text-zinc-600 rotate-90 md:rotate-0" size={16} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Core files detection & mapping */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <h3 className="text-xs uppercase font-bold text-zinc-500 tracking-wider">
              Detected Core Interactions
            </h3>

            <div className="space-y-3">
              {detectedComponents.map((comp) => (
                <div
                  key={comp.name}
                  className="glow-card rounded-xl p-5 glow-indigo flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-zinc-900 text-zinc-300">
                      <FileCode size={20} />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">{comp.name}</h4>
                      <div className="flex items-center gap-3 mt-1.5 text-[10px] text-zinc-500 font-semibold uppercase">
                        <span>{comp.type}</span>
                        <span>•</span>
                        <span>{comp.events.length} Events Detected</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 self-end sm:self-center">
                    <div className="text-right">
                      <span className="text-[10px] text-zinc-400 font-bold block">{comp.progress}</span>
                      <span className="text-[9px] text-zinc-500 font-semibold block">{comp.status}</span>
                    </div>
                    <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="glow-card rounded-xl p-6 glow-purple flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                <Sparkles size={14} className="text-indigo-400" />
                Telemetry Generator
              </h3>
              <p className="text-xs text-zinc-400 leading-relaxed mb-4">
                Want to run code parsing manually on a new file structure? Let the AI engine analyze your repo components layout.
              </p>
              <div className="bg-black/50 p-4 rounded-lg border border-zinc-900 font-mono text-[10px] text-zinc-400 mb-6">
                <div>$ aletsch-cli analyze ./src</div>
                <div className="text-indigo-400 mt-1">&gt; 4 core routes found.</div>
                <div className="text-cyan-400">&gt; 12 button handlers mapped.</div>
                <div className="text-emerald-400">&gt; Generating instrument.json...</div>
              </div>
            </div>
            <button className="w-full flex items-center justify-center gap-1.5 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 border border-indigo-500/20 rounded-lg py-2.5 text-xs font-semibold transition cursor-pointer">
              <Play size={12} />
              <span>Run Auto-Parser</span>
            </button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
