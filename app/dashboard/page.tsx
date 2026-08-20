"use client";

import { useUser } from "@clerk/nextjs";
import { useState, useEffect } from "react";
import DashboardLayout from "@/components/navigation/DashboardLayout";
import {
  Users as UsersIcon,
  Activity,
  Flame,
  Clock,
  AlertTriangle,
  Sparkles,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  ShieldCheck,
  Code,
  CheckCircle2,
  Calendar,
  ChevronDown,
} from "lucide-react";

export default function Dashboard() {
  const { user, isLoaded } = useUser();
  const [dateRange, setDateRange] = useState("Last 7 days");
  const [showRangeDropdown, setShowRangeDropdown] = useState(false);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDashboard() {
      try {
        const res = await fetch("/api/dashboard");
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch (err) {
        console.error("Failed to load dashboard statistics:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchDashboard();
  }, []);

  const metrics = [
    {
      title: "Total Users",
      value: data?.totalUsers || "0",
      change: "+12.5%",
      isPositive: true,
      icon: UsersIcon,
      colorClass: "text-indigo-400",
      bgClass: "bg-indigo-500/10",
      glowClass: "glow-indigo",
      sparkline: [20, 35, 30, 45, 40, 55, 52],
    },
    {
      title: "Events Tracked",
      value: data?.eventsTracked || "0",
      change: "+18.3%",
      isPositive: true,
      icon: Activity,
      colorClass: "text-purple-400",
      bgClass: "bg-purple-500/10",
      glowClass: "glow-purple",
      sparkline: [10, 15, 25, 20, 35, 42, 47],
    },
    {
      title: "Conversion Rate",
      value: data?.conversionRate || "0.0%",
      change: "+6.1%",
      isPositive: true,
      icon: Flame,
      colorClass: "text-cyan-400",
      bgClass: "bg-cyan-500/10",
      glowClass: "glow-cyan",
      sparkline: [30, 32, 28, 31, 33, 35, 34.6],
    },
    {
      title: "Avg. Session Time",
      value: data?.averageSessionTime || "0s",
      change: "+8.7%",
      isPositive: true,
      icon: Clock,
      colorClass: "text-emerald-400",
      bgClass: "bg-emerald-500/10",
      glowClass: "glow-emerald",
      sparkline: [250, 240, 260, 255, 270, 272, 272],
    },
    {
      title: "At Risk Drop-offs",
      value: String(data?.atRiskDropoffs ?? "0"),
      change: "-2 vs last week",
      isPositive: true,
      icon: AlertTriangle,
      colorClass: "text-rose-400",
      bgClass: "bg-rose-500/10",
      glowClass: "glow-rose",
      sparkline: [7, 6, 5, 5, 4, 3, 3],
    },
  ];

  const funnelSteps = data?.funnel && data.funnel.length > 0 ? data.funnel : [
    { name: "Landing Page", rate: "100%", users: "0", drop: null, active: true },
    { name: "Sign Up", rate: "0%", users: "0", drop: "0%", active: true },
    { name: "Login", rate: "0%", users: "0", drop: "0%", active: true },
    { name: "Create Task", rate: "0%", users: "0", drop: "0%", active: true },
    { name: "Task Completed", rate: "0%", users: "0", drop: "0%", active: true },
  ];


  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Welcome Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              Welcome back, {isLoaded && user ? user.firstName : "Developer"}! 👋
            </h1>
            <p className="text-sm text-zinc-400">
              Here&apos;s what&apos;s happening with your application today.
            </p>
          </div>

          {/* Date range picker */}
          <div className="relative">
            <button
              onClick={() => setShowRangeDropdown(!showRangeDropdown)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-zinc-800/80 bg-zinc-950/40 text-xs font-semibold text-zinc-300 hover:text-white transition"
            >
              <Calendar size={14} className="text-indigo-400" />
              <span>{dateRange}</span>
              <ChevronDown size={14} className="text-zinc-500" />
            </button>
            {showRangeDropdown && (
              <div className="absolute right-0 mt-2 w-48 rounded-lg border border-zinc-800 bg-zinc-950 shadow-2xl p-1 z-50">
                {["Today", "Last 7 days", "Last 30 days", "Custom range"].map((range) => (
                  <button
                    key={range}
                    onClick={() => {
                      setDateRange(range);
                      setShowRangeDropdown(false);
                    }}
                    className="w-full text-left px-3 py-2 rounded-md text-xs hover:bg-zinc-900 text-zinc-300 hover:text-white transition"
                  >
                    {range}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Top Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {metrics.map((metric) => {
            const Icon = metric.icon;
            const maxVal = Math.max(...metric.sparkline);
            const minVal = Math.min(...metric.sparkline);
            const pathData = metric.sparkline
              .map((val, i) => {
                const x = (i / (metric.sparkline.length - 1)) * 100;
                const range = maxVal - minVal || 1;
                const y = 8 + 24 - ((val - minVal) / range) * 24; // map into height 40 with padding
                return `${i === 0 ? "M" : "L"} ${x} ${y}`;
              })
              .join(" ");

            return (
              <div
                key={metric.title}
                className={`glow-card rounded-xl p-4 flex flex-col justify-between overflow-hidden relative ${metric.glowClass}`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-zinc-400 font-medium">{metric.title}</span>
                  <div className={`p-1.5 rounded-lg ${metric.bgClass} ${metric.colorClass}`}>
                    <Icon size={14} />
                  </div>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white tracking-tight">{metric.value}</h3>
                  <div className="flex items-center gap-1 mt-1">
                    {metric.isPositive ? (
                      <TrendingUp size={12} className="text-emerald-400" />
                    ) : (
                      <TrendingDown size={12} className="text-rose-400" />
                    )}
                    <span
                      className={`text-[10px] font-semibold ${
                        metric.isPositive ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {metric.change}
                    </span>
                  </div>
                </div>

                {/* SVG Sparkline */}
                <div className="h-10 mt-3 -mx-4 -mb-4 overflow-hidden relative opacity-60">
                  <svg className="w-full h-full" viewBox="0 0 100 40" preserveAspectRatio="none">
                    <path
                      d={pathData}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      className={metric.colorClass}
                    />
                  </svg>
                </div>
              </div>
            );
          })}
        </div>

        {/* Funnel & Tracked Events section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Funnel Card */}
          <div className="lg:col-span-2 glow-card rounded-xl p-6 glow-indigo relative overflow-hidden flex flex-col justify-between">
            <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl" />

            <div>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-white">Predicted User Funnel</h3>
                  <span className="flex items-center gap-1 text-[9px] text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full font-bold">
                    <Sparkles size={8} />
                    AI Generated
                  </span>
                </div>
                <span className="text-[10px] text-zinc-400 font-semibold cursor-pointer hover:text-white transition">
                  Overall Funnel ▾
                </span>
              </div>

              {/* Horizontal Funnel visualization */}
              <div className="relative py-8 flex items-center justify-between gap-2 overflow-x-auto min-w-[500px]">
                {/* SVG connector lines for flow background */}
                <div className="absolute top-[52px] left-[5%] right-[5%] h-1 z-0 pointer-events-none">
                  <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 10">
                    <path
                      d="M 0 5 Q 25 8, 50 2 T 100 5"
                      fill="none"
                      stroke="#1f1f2e"
                      strokeWidth="2"
                    />
                    <path
                      d="M 0 5 Q 25 8, 50 2 T 100 5"
                      fill="none"
                      stroke="url(#indigo-grad)"
                      strokeWidth="2"
                      className="animate-flow-dash"
                    />
                    <defs>
                      <linearGradient id="indigo-grad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#6366f1" />
                        <stop offset="50%" stopColor="#a855f7" />
                        <stop offset="100%" stopColor="#06b6d4" />
                      </linearGradient>
                    </defs>
                  </svg>
                </div>

                {funnelSteps.map((step, idx) => (
                  <div key={step.name} className="flex-1 flex flex-col items-center relative z-10">
                    <div className="relative">
                      <div className="w-12 h-12 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-300 hover:border-indigo-500 hover:text-white transition cursor-pointer relative shadow-lg">
                        {idx + 1}
                      </div>
                      {step.drop && (
                        <div className="absolute -left-12 top-1/2 -translate-y-1/2 flex flex-col items-center">
                          <span className="text-[9px] text-rose-500 font-bold bg-rose-500/10 px-1 rounded">
                            ↓ {step.drop}
                          </span>
                        </div>
                      )}
                    </div>

                    <span className="text-[11px] font-semibold text-zinc-300 mt-3 text-center whitespace-nowrap">
                      {step.name}
                    </span>
                    <span className="text-[12px] font-bold text-white mt-1">{step.rate}</span>
                    <span className="text-[9px] text-zinc-500 mt-0.5">{step.users} users</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom Alert bar */}
            <div className="mt-6 p-4 rounded-lg bg-zinc-950/80 border border-zinc-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-rose-500/10 text-rose-400">
                  <AlertTriangle size={16} />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">Top Drop-off Spot</h4>
                  <p className="text-[10px] text-zinc-400">
                    Users are dropping off most (31.6%) between Sign Up and Login steps.
                  </p>
                </div>
              </div>
              <button className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition flex items-center gap-1 cursor-pointer">
                View AI Insights <ArrowRight size={12} />
              </button>
            </div>
          </div>

          {/* Top Tracked Events Card */}
          <div className="glow-card rounded-xl p-6 glow-purple flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-white">Top Tracked Events</h3>
                <span className="text-xs text-indigo-400 font-semibold hover:text-indigo-300 transition cursor-pointer">
                  View All
                </span>
              </div>

              <div className="space-y-3">
                {(data?.topEvents && data.topEvents.length > 0 ? data.topEvents.map((e: any) => ({
                  name: e.name,
                  count: e.count,
                  cat: e.cat,
                  color: e.cat === "Pageview" ? "bg-indigo-500/20 text-indigo-300" :
                         e.cat === "Interaction" ? "bg-purple-500/20 text-purple-300" :
                         e.cat === "System" ? "bg-cyan-500/20 text-cyan-300" :
                         e.cat === "Form" ? "bg-emerald-500/20 text-emerald-300" : "bg-zinc-500/20 text-zinc-300"
                })) : [
                  { name: "Page Viewed", count: "12,653", cat: "Pageview", color: "bg-indigo-500/20 text-indigo-300" },
                  { name: "Button Clicked", count: "7,842", cat: "Interaction", color: "bg-purple-500/20 text-purple-300" },
                  { name: "User Logged In", count: "4,552", cat: "System", color: "bg-cyan-500/20 text-cyan-300" },
                  { name: "Form Submitted", count: "4,312", cat: "Form", color: "bg-emerald-500/20 text-emerald-300" },
                  { name: "Task Created", count: "3,241", cat: "Interaction", color: "bg-purple-500/20 text-purple-300" },
                ]).map((ev: any) => (
                  <div key={ev.name} className="flex items-center justify-between py-1.5 border-b border-zinc-900 last:border-0">
                    <div className="flex items-center gap-2.5">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${ev.color}`}>
                        {ev.cat}
                      </span>
                      <span className="text-xs font-medium text-zinc-300">{ev.name}</span>
                    </div>
                    <span className="text-xs font-bold text-zinc-100">{ev.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Third Row: Insights, Status, Activity, Health */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* AI Insights Card */}
          <div className="glow-card rounded-xl p-6 glow-purple flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                <Sparkles size={14} className="text-indigo-400" />
                AI Insights
              </h3>

              <div className="space-y-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-rose-400 text-xs font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                    High Drop-Off Detected
                  </div>
                  <p className="text-[10px] text-zinc-400 leading-normal">
                    31.6% of users abandon onboarding after Sign Up before reaching Login.
                  </p>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-indigo-400 text-xs font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                    Optimization Opportunity
                  </div>
                  <p className="text-[10px] text-zinc-400 leading-normal">
                    Simplifying the sign-up form field requirement can boost logins by 14%.
                  </p>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Positive User Behavior
                  </div>
                  <p className="text-[10px] text-zinc-400 leading-normal">
                    Users creating a task within 3 minutes are 2.4x more likely to remain active.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Auto-Instrumentation Status Card */}
          <div className="glow-card rounded-xl p-6 glow-cyan flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-bold text-white mb-4">Instrumentation Status</h3>
              <div className="flex items-center gap-6">
                {/* Circular Gauge */}
                <div className="relative w-20 h-20 flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle cx="40" cy="40" r="34" className="stroke-zinc-800" strokeWidth="6" fill="transparent" />
                    <circle
                      cx="40"
                      cy="40"
                      r="34"
                      className="stroke-cyan-500"
                      strokeWidth="6"
                      fill="transparent"
                      strokeDasharray="213"
                      strokeDashoffset="17" // 92%
                    />
                  </svg>
                  <div className="absolute flex flex-col items-center justify-center">
                    <span className="text-base font-extrabold text-white">92%</span>
                    <span className="text-[8px] text-zinc-500 uppercase tracking-widest font-bold">Inst.</span>
                  </div>
                </div>

                <div className="flex-1 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-zinc-400">Pages</span>
                    <span className="font-semibold text-white">98%</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-zinc-400">Components</span>
                    <span className="font-semibold text-white">89%</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-zinc-400">Events</span>
                    <span className="font-semibold text-white">93%</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-zinc-400">API Calls</span>
                    <span className="font-semibold text-white">85%</span>
                  </div>
                </div>
              </div>
            </div>
            <button className="w-full mt-4 bg-zinc-950/80 border border-zinc-800 hover:border-zinc-700 text-xs font-semibold py-2 rounded-lg text-zinc-300 transition cursor-pointer">
              View Instrumentation
            </button>
          </div>

          {/* Recent Activity Card */}
          <div className="glow-card rounded-xl p-6 glow-indigo flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-white">Recent Activity</h3>
                <span className="text-xs text-indigo-400 font-semibold hover:text-indigo-300 transition cursor-pointer">
                  View All
                </span>
              </div>

              <div className="space-y-3">
                {(data?.recentActivity && data.recentActivity.length > 0 ? data.recentActivity.map((r: any) => ({
                  desc: r.desc,
                  time: r.time,
                  icon: r.type === "code" ? Code : r.type === "alert" ? AlertTriangle : r.type === "sync" ? CheckCircle2 : Activity,
                  color: r.type === "code" ? "text-cyan-400" : r.type === "alert" ? "text-rose-400" : r.type === "sync" ? "text-emerald-400" : "text-indigo-400"
                })) : [
                  { desc: "New event tracked: Task Completed", time: "2m ago", icon: Activity, color: "text-emerald-400" },
                  { desc: "Instrumentation added: Calendar.tsx", time: "15m ago", icon: Code, color: "text-cyan-400" },
                  { desc: "Drop-off alert: Sign Up Page", time: "32m ago", icon: AlertTriangle, color: "text-rose-400" },
                  { desc: "Repository synced successfully", time: "1h ago", icon: CheckCircle2, color: "text-emerald-400" },
                ]).map((act: any, i: number) => {
                  const Icon = act.icon;
                  return (
                    <div key={i} className="flex gap-2.5 items-start">
                      <Icon size={12} className={`mt-0.5 ${act.color}`} />
                      <div className="flex-1 flex flex-col">
                        <span className="text-[10px] text-zinc-300 leading-normal">{act.desc}</span>
                        <span className="text-[9px] text-zinc-500 mt-0.5">{act.time}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* System Health Card */}
          <div className="glow-card rounded-xl p-6 glow-emerald flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-white">System Health</h3>
                <span className="flex items-center gap-1 text-[9px] text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded">
                  ● All Systems OK
                </span>
              </div>

              <div className="space-y-2">
                {[
                  { name: "Repository Connection", val: 100 },
                  { name: "Event Processing", val: 98 },
                  { name: "AI Analysis Engine", val: 95 },
                  { name: "Dashboard Service", val: 100 },
                ].map((sys) => (
                  <div key={sys.name} className="space-y-1">
                    <div className="flex justify-between text-[9px] text-zinc-400 font-semibold">
                      <span>{sys.name}</span>
                      <span>{sys.val}%</span>
                    </div>
                    <div className="h-1 bg-zinc-900 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500"
                        style={{ width: `${sys.val}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Glowing mini path line graph */}
            <div className="h-6 mt-4 opacity-50">
              <svg className="w-full h-full" viewBox="0 0 100 20" preserveAspectRatio="none">
                <path
                  d="M 0 10 L 20 8 L 40 12 L 60 7 L 80 15 L 100 3"
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="1.5"
                />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
