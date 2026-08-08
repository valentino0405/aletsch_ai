import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { ArrowRight, Sparkles, Terminal, Activity, BrainCircuit } from "lucide-react";

export default async function Home() {
  const { userId } = await auth();

  return (
    <div className="flex min-h-screen flex-col bg-[#030307] text-zinc-100 relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-0 left-1/4 h-[500px] w-[500px] rounded-full bg-indigo-500/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-10 right-1/4 h-[500px] w-[500px] rounded-full bg-purple-500/10 blur-[120px] pointer-events-none" />

      {/* Header */}
      <header className="h-20 flex items-center justify-between px-8 max-w-7xl w-full mx-auto relative z-10">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-indigo-500 via-purple-500 to-cyan-500 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20">
            A
          </div>
          <span className="font-semibold text-lg tracking-tight bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
            Aletsch AI
          </span>
        </div>

        <div>
          {userId ? (
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-4 py-2 text-xs font-semibold shadow-md shadow-indigo-600/10 transition"
            >
              Dashboard <ArrowRight size={14} />
            </Link>
          ) : (
            <Link
              href="/sign-in"
              className="inline-flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-100 rounded-lg px-4 py-2 text-xs font-semibold transition"
            >
              Sign In
            </Link>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-6 py-20 md:py-32 text-center flex flex-col items-center justify-center relative z-10">
        <span className="inline-flex items-center gap-1.5 text-[10px] text-indigo-400 bg-indigo-500/10 px-3 py-1 rounded-full font-bold uppercase tracking-wider mb-6 border border-indigo-500/20">
          <Sparkles size={10} /> Auto-Instrumented Analytics
        </span>

        <h1 className="text-4xl md:text-6xl font-extrabold leading-tight text-white mb-6 tracking-tight max-w-3xl">
          Analytics for{" "}
          <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
            AI-Built Applications
          </span>
        </h1>

        <p className="text-sm md:text-base text-zinc-400 max-w-xl mb-10 leading-relaxed">
          Connect your GitHub repository. Let Aletsch AI parse component trees, identify CTAs, forms, and navigation routes, then automatically generate event instrumentation.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 mb-20">
          <Link
            href={userId ? "/dashboard" : "/sign-up"}
            className="flex h-11 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-6 text-xs font-bold text-white transition shadow-lg shadow-indigo-600/20"
          >
            Get Started Free <ArrowRight size={14} />
          </Link>
          <a
            href="https://github.com/valentino0405/aletsch_ai"
            target="_blank"
            rel="noreferrer"
            className="flex h-11 items-center justify-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/40 hover:bg-zinc-900/60 px-6 text-xs font-semibold text-zinc-200 transition"
          >
            <Terminal size={14} className="text-indigo-400" />
            GitHub Repository
          </a>
        </div>

        {/* Workflow Concept Banner */}
        <div className="w-full max-w-3xl p-6 rounded-2xl border border-zinc-800/80 bg-zinc-950/20 backdrop-blur-xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-indigo-500/20 to-transparent" />
          <h2 className="text-xs uppercase font-bold text-zinc-500 tracking-wider mb-6">
            The Aletsch AI Engine Pipeline
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-left">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Terminal size={16} className="text-indigo-400" />
                <h4 className="text-xs font-bold text-white">01. Code Understanding</h4>
              </div>
              <p className="text-[11px] text-zinc-500 leading-normal">
                Parses React components layout to map pages, forms, and click targets.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Activity size={16} className="text-purple-400" />
                <h4 className="text-xs font-bold text-white">02. Auto Instrumentation</h4>
              </div>
              <p className="text-[11px] text-zinc-500 leading-normal">
                Automatically determines important events and generates tracing telemetry hooks.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <BrainCircuit size={16} className="text-cyan-400" />
                <h4 className="text-xs font-bold text-white">03. AI Analytics & Funnels</h4>
              </div>
              <p className="text-[11px] text-zinc-500 leading-normal">
                Models conversion pipelines and exposes drop-off recommendations.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="h-16 flex items-center justify-between px-8 border-t border-zinc-900 text-[10px] text-zinc-600 max-w-7xl w-full mx-auto relative z-10">
        <span>© {new Date().getFullYear()} Aletsch AI. All rights reserved.</span>
        <span>Built for AI-built software products.</span>
      </footer>
    </div>
  );
}
