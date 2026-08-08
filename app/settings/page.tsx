"use client";

import DashboardLayout from "@/components/navigation/DashboardLayout";
import { Settings as SettingsIcon, Shield, Sliders, Terminal, Bell } from "lucide-react";

export default function Settings() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <SettingsIcon className="text-indigo-400" />
            Settings
          </h1>
          <p className="text-sm text-zinc-400">
            Configure your Aletsch AI telemetry and connection profile settings.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Settings Sidebar Tabs */}
          <div className="lg:col-span-1 space-y-2">
            {[
              { name: "General Settings", icon: Sliders, active: true },
              { name: "Repository Configuration", icon: Terminal, active: false },
              { name: "Notification Preferences", icon: Bell, active: false },
              { name: "Security & API Access", icon: Shield, active: false },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.name}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold transition cursor-pointer text-left ${
                    tab.active
                      ? "bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 glow-indigo"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40 border border-transparent"
                  }`}
                >
                  <Icon size={14} />
                  <span>{tab.name}</span>
                </button>
              );
            })}
          </div>

          {/* Configuration Form */}
          <div className="lg:col-span-2 glow-card rounded-xl p-6 glow-indigo space-y-6">
            <h3 className="text-sm font-bold text-white border-b border-zinc-900 pb-3">
              General Configuration
            </h3>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-500 block mb-1">
                  Active Project Name
                </label>
                <input
                  type="text"
                  defaultValue="TaskFlow Pro"
                  className="w-full max-w-md bg-zinc-900 border border-zinc-800 focus:border-indigo-500 rounded-lg px-3.5 py-2 text-xs text-zinc-200 outline-none transition"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-500 block mb-1">
                  Tracked Branch Target
                </label>
                <input
                  type="text"
                  defaultValue="main"
                  className="w-full max-w-md bg-zinc-900 border border-zinc-800 focus:border-indigo-500 rounded-lg px-3.5 py-2 text-xs text-zinc-200 outline-none transition"
                />
              </div>

              <div className="space-y-3 pt-4 border-t border-zinc-900">
                <h4 className="text-xs font-bold text-white">Analytics Settings</h4>
                <div className="flex items-center justify-between py-2 border-b border-zinc-900">
                  <div>
                    <span className="text-xs font-medium text-zinc-300 block">AI Funnel Predictions</span>
                    <span className="text-[10px] text-zinc-500">Enable automatic funnel modeling from Component Trees.</span>
                  </div>
                  <input type="checkbox" defaultChecked className="accent-indigo-500" />
                </div>

                <div className="flex items-center justify-between py-2">
                  <div>
                    <span className="text-xs font-medium text-zinc-300 block">Anomaly Alerting Emails</span>
                    <span className="text-[10px] text-zinc-500">Send notifications on rapid user progression drop-offs.</span>
                  </div>
                  <input type="checkbox" defaultChecked className="accent-indigo-500" />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-6 border-t border-zinc-900">
              <button className="px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-white transition cursor-pointer">
                Discard Changes
              </button>
              <button className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow-md transition cursor-pointer">
                Save Preferences
              </button>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
