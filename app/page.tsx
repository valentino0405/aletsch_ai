import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import {
  ArrowRight,
  Sparkles,
  GitBranch,
  Search,
  Cpu,
  Database,
  Filter,
  ShieldCheck,
  Zap,
  Code2,
  MousePointerClick,
  Route,
  FileCode,
  BarChart3,
  Activity,
  ChevronsRight,
} from "lucide-react";
import LandingNav from "@/components/landing/LandingNav";
import Reveal from "@/components/landing/Reveal";

// Placeholder metrics — content to be swapped later.
const STATS = [
  { v: "< 5 min", l: "Setup Time" },
  { v: "100%", l: "Auto-Instrumented" },
  { v: "24/7", l: "Monitoring" },
];

const HOW = [
  { Icon: GitBranch, title: "Connect the Repo", desc: "Link a GitHub repository read-only. Nothing runs inside your own infrastructure." },
  { Icon: Search, title: "Understand the Code", desc: "Static analysis maps routes, components and interactions, each with a confidence score." },
  { Icon: Cpu, title: "Auto-Instrument", desc: "Tracking hooks are generated for you automatically — no manual tagging anywhere." },
  { Icon: Database, title: "Ingest Events", desc: "Events stream in through a secure per-project key and are sanitised at the edge." },
  { Icon: Filter, title: "Analyze Funnels", desc: "Funnels, retention and paths, all computed from events you can actually trust." },
  { Icon: Sparkles, title: "Act on Insights", desc: "AI surfaces what changed and where users drop off — always with provenance." },
];

const POWER = [
  { Icon: Sparkles, title: "Honest Numbers", desc: "Every metric traces to a counted event, or it says “Insufficient data” — never a guess." },
  { Icon: ShieldCheck, title: "Secure by Design", desc: "Publishable write keys, constant-time comparison, and PII stripped before storage." },
  { Icon: Zap, title: "Built for AI-Built Apps", desc: "Instrument code you shipped fast and never hand-tracked — in minutes, not sprints." },
];

export default async function Home() {
  const { userId } = await auth();
  const signedIn = !!userId;

  return (
    <div id="top" className="relative min-h-screen overflow-hidden bg-[#060a14] text-slate-100">
      <LandingNav signedIn={signedIn} />
      {/* HERO */}
      <section className="relative overflow-hidden px-6 pb-20 pt-40 text-center sm:pt-44">
        {/* aurora backdrop */}
        <div className="pointer-events-none absolute left-1/2 top-0 h-[600px] w-[1200px] -translate-x-1/2 rounded-[100%] bg-[radial-gradient(ellipse_at_center,rgba(37,99,235,0.14),transparent_60%)]" />
        <div className="pointer-events-none absolute -left-20 top-24 h-[360px] w-[360px] rotate-12 rounded-full bg-blue-600/10 blur-[120px]" />
        <div className="pointer-events-none absolute -right-20 top-40 h-[360px] w-[360px] -rotate-12 rounded-full bg-indigo-600/10 blur-[120px]" />

        <div className="relative z-10 mx-auto max-w-3xl">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-1.5 text-xs font-medium text-slate-300">
            <Sparkles size={12} className="text-blue-400" /> Auto-Instrumented Analytics
          </span>

          <h1 className="mt-7 text-5xl font-bold leading-[1.05] tracking-tight text-white sm:text-6xl">
            Spot What Users Do
            <br />
            Before{" "}
            <span className="bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
              You Even Ask
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-slate-400">
            Connect your repo and Aletsch reads your code, generates the instrumentation,
            and turns clicks into funnels — automatically, and with numbers you can trust.
          </p>

          <div className="mt-9 flex items-center justify-center gap-3">
            <Link
              href={signedIn ? "/dashboard" : "/sign-up"}
              className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/25 transition-colors hover:bg-blue-500"
            >
              {signedIn ? "Open Dashboard" : "Get Started"}
              <ArrowRight size={15} />
            </Link>
            <a
              href="#features"
              className="rounded-full border border-white/10 bg-white/[0.03] px-6 py-3 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/[0.06]"
            >
              Learn More
            </a>
          </div>
        </div>

        {/* Stats */}
        <div className="relative z-10 mx-auto mt-20 grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-3">
          {STATS.map((s) => (
            <div
              key={s.l}
              className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-6 py-5 backdrop-blur-sm"
            >
              <div className="text-xs font-medium text-slate-500">{s.l}</div>
              <div className="mt-1.5 bg-gradient-to-r from-white to-slate-300 bg-clip-text text-3xl font-bold text-transparent">
                {s.v}
              </div>
            </div>
          ))}
        </div>
      </section>
      {/* FEATURES */}
      <section id="features" className="scroll-mt-24 px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <Reveal className="text-center">
            <h2 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
              What Is Aletsch AI?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-slate-400">
              A suite that reads your product&apos;s code and detects the signals and
              behavioural patterns worth measuring — before you write a line of tracking.
            </p>
          </Reveal>

          <div className="mt-14 grid gap-5 lg:grid-cols-2">
            <Reveal className="h-full">
              <div className="group h-full rounded-2xl border border-white/[0.07] bg-white/[0.02] p-7 transition-colors hover:border-blue-500/30">
                <div className="relative mb-6 h-40">
                  <div className="absolute left-1/2 top-1/2 h-px w-56 max-w-full -translate-x-1/2 -translate-y-1/2 bg-gradient-to-r from-transparent via-blue-500/25 to-transparent" />
                  <div className="absolute left-6 top-5 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-slate-400"><FileCode size={16} /></div>
                  <div className="absolute right-6 top-5 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-slate-400"><Route size={16} /></div>
                  <div className="absolute bottom-5 left-10 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-slate-400"><MousePointerClick size={16} /></div>
                  <div className="absolute bottom-5 right-10 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-slate-400"><Code2 size={16} /></div>
                  <div className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-blue-500/40 bg-blue-500/10 text-blue-300 shadow-[0_0_40px_rgba(37,99,235,0.3)]"><Cpu size={24} /></div>
                </div>
                <h3 className="text-xl font-semibold text-white">Code Understanding</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">
                  Aletsch parses your component tree to map pages, forms and click targets —
                  the exact moments worth measuring, found automatically.
                </p>
              </div>
            </Reveal>

            <Reveal delay={100} className="h-full">
              <div className="group h-full rounded-2xl border border-white/[0.07] bg-white/[0.02] p-7 transition-colors hover:border-blue-500/30">
                <div className="relative mb-6 flex h-40 items-center justify-center gap-2.5">
                  <div className="absolute left-1/2 top-1/2 h-px w-72 max-w-full -translate-x-1/2 -translate-y-1/2 bg-gradient-to-r from-transparent via-blue-500/25 to-transparent" />
                  <div className="relative z-10 flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-[#0b1120] text-slate-400"><Code2 size={18} /></div>
                  <div className="relative z-10 flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-[#0b1120] text-slate-400"><MousePointerClick size={18} /></div>
                  <div className="relative z-10 flex h-14 w-14 items-center justify-center rounded-xl border border-blue-500/40 bg-blue-500/10 text-blue-300 shadow-[0_0_40px_rgba(37,99,235,0.3)]"><Cpu size={22} /></div>
                  <div className="relative z-10 flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-[#0b1120] text-slate-400"><Database size={18} /></div>
                  <div className="relative z-10 flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-[#0b1120] text-slate-400"><Activity size={18} /></div>
                </div>
                <h3 className="text-xl font-semibold text-white">Auto Instrumentation</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">
                  Event tracking is generated for you and streamed through a per-project key.
                  No SDK boilerplate, no tagging plan to maintain.
                </p>
              </div>
            </Reveal>
          </div>
          <div className="mt-5 grid gap-5 md:grid-cols-3">
            <Reveal className="h-full">
              <div className="group h-full rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6 transition-colors hover:border-blue-500/30">
                <div className="mb-5 flex h-24 items-center justify-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-blue-300 shadow-[0_0_30px_rgba(37,99,235,0.15)]"><BarChart3 size={24} /></div>
                </div>
                <h3 className="text-lg font-semibold text-white">Funnel Analysis</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">
                  Model conversion pipelines and surface drop-off — all from real counted events.
                </p>
              </div>
            </Reveal>

            <Reveal delay={100} className="h-full">
              <div className="group h-full rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6 transition-colors hover:border-blue-500/30">
                <div className="mb-5 flex h-24 items-center justify-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-blue-300 shadow-[0_0_30px_rgba(37,99,235,0.15)]"><ShieldCheck size={24} /></div>
                </div>
                <h3 className="text-lg font-semibold text-white">Secure Ingest</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">
                  Per-project write key, constant-time checks, and PII stripped before storage.
                </p>
              </div>
            </Reveal>

            <Reveal delay={200} className="h-full">
              <div className="h-full rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6">
                <div className="mb-5 space-y-2">
                  {[
                    { t: "Route mapped", s: "/checkout", a: "2m ago" },
                    { t: "CTA detected", s: "“Start Free” button", a: "5m ago" },
                    { t: "Funnel step", s: "Sign-up → Activate", a: "8m ago" },
                  ].map((r) => (
                    <div key={r.s} className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                      <div>
                        <div className="text-xs font-medium text-slate-200">{r.t}</div>
                        <div className="text-[10px] text-slate-500">{r.s}</div>
                      </div>
                      <div className="font-mono text-[10px] text-slate-500">{r.a}</div>
                    </div>
                  ))}
                </div>
                <h3 className="text-lg font-semibold text-white">Live Event Feed</h3>
                <p className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                  <span className="h-1.5 w-1.5 animate-pulse-glow rounded-full bg-emerald-400 text-emerald-400" />
                  Live monitoring active
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>
      {/* HOW IT WORKS */}
      <section id="how" className="scroll-mt-24 px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <Reveal className="text-center">
            <h2 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
              How It Works
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-slate-400">
              From a connected repository to answers you can act on — five analysis stages
              and one AI layer, running on events you can trust.
            </p>
          </Reveal>

          <div className="mt-14 grid gap-4 md:grid-cols-3">
            {HOW.map((h, i) => (
              <Reveal key={h.title} delay={(i % 3) * 80} className="h-full">
                <div className="group h-full rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6 transition-colors hover:border-blue-500/30">
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-blue-300">
                    <h.Icon size={18} />
                  </div>
                  <h3 className="text-base font-semibold text-white">{h.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">{h.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
      {/* POWER */}
      <section id="power" className="scroll-mt-24 border-t border-white/[0.06] px-6 py-24">
        <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-2 lg:items-center">
          <Reveal>
            <h2 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
              The Power Of{" "}
              <span className="bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
                Aletsch
              </span>
            </h2>
            <p className="mt-5 max-w-md text-sm leading-relaxed text-slate-400">
              Analytics you can defend in a review: generated from your own code, measured
              from real events, and honest when the data isn&apos;t there.
            </p>
            <div className="mt-8 flex gap-12">
              <div>
                <div className="text-3xl font-bold text-white">0</div>
                <div className="mt-1 text-xs text-slate-500">Lines of tracking code</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-white">100%</div>
                <div className="mt-1 text-xs text-slate-500">Traceable numbers</div>
              </div>
            </div>
            <Link
              href={signedIn ? "/dashboard" : "/sign-up"}
              className="mt-8 inline-block rounded-full border border-white/10 bg-white/[0.03] px-6 py-3 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/[0.06]"
            >
              Learn More
            </Link>
          </Reveal>

          <div className="space-y-3">
            {POWER.map((p, i) => (
              <Reveal key={p.title} delay={i * 80}>
                <div
                  className={`flex items-start gap-4 rounded-2xl border p-5 transition-colors ${
                    i === 0
                      ? "border-blue-500/30 bg-blue-500/[0.04]"
                      : "border-white/[0.07] bg-white/[0.02] hover:border-blue-500/20"
                  }`}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-blue-300">
                    <p.Icon size={18} />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-white">{p.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-slate-400">{p.desc}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
      {/* CTA */}
      <section className="relative overflow-hidden border-t border-white/[0.06] px-6 py-28 text-center">
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-[360px] w-[640px] -translate-x-1/2 -translate-y-1/2 rounded-[100%] bg-[radial-gradient(ellipse_at_center,rgba(37,99,235,0.16),transparent_60%)]" />
        <div className="relative mx-auto max-w-2xl">
          <Reveal>
            <h2 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Point it at your repo.
            </h2>
            <p className="mx-auto mt-5 max-w-lg text-sm leading-relaxed text-slate-400">
              Connect a repository and watch Aletsch map, instrument and analyze it — in
              minutes, with numbers you can trust.
            </p>
            <Link
              href={signedIn ? "/dashboard" : "/sign-up"}
              className="mt-8 inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-7 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/25 transition-colors hover:bg-blue-500"
            >
              {signedIn ? "Open Dashboard" : "Get Started"}
              <ArrowRight size={15} />
            </Link>
          </Reveal>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/[0.06] px-6 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-2">
            <ChevronsRight size={16} className="text-blue-500" />
            <span className="text-sm font-semibold text-white">Aletsch AI</span>
          </div>
          <p className="text-xs text-slate-500">
            © {new Date().getFullYear()} Aletsch AI · Analytics for AI-built apps
          </p>
        </div>
      </footer>
    </div>
  );
}
