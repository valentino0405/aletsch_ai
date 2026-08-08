"use client";

import DashboardLayout from "@/components/navigation/DashboardLayout";
import { Users as UsersIcon, Search, MoreHorizontal } from "lucide-react";

export default function Users() {
  const users = [
    { email: "john.doe@gmail.com", sessions: 12, events: 48, lastActive: "2m ago", funnel: "Task Completed", status: "Active" },
    { email: "alice.s@live.com", sessions: 8, events: 32, lastActive: "15m ago", funnel: "Create Task", status: "Active" },
    { email: "bob.dev@yahoo.com", sessions: 2, events: 8, lastActive: "1h ago", funnel: "Login", status: "Inactive" },
    { email: "clara.w@outlook.com", sessions: 1, events: 2, lastActive: "2h ago", funnel: "Sign Up", status: "Inactive" },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <UsersIcon className="text-indigo-400" />
            Users Analytics
          </h1>
          <p className="text-sm text-zinc-400">
            Identify specific users, their session counts, and current funnel progression stages.
          </p>
        </div>

        {/* Users Table */}
        <div className="glow-card rounded-xl overflow-hidden glow-indigo">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-900 bg-zinc-950/40 text-[10px] uppercase font-bold text-zinc-500 tracking-wider">
                  <th className="py-4 px-6">User Email</th>
                  <th className="py-4 px-4 text-right">Sessions</th>
                  <th className="py-4 px-4 text-right">Events Tracked</th>
                  <th className="py-4 px-4">Funnel Stage</th>
                  <th className="py-4 px-4">Status</th>
                  <th className="py-4 px-6 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900 text-xs">
                {users.map((us) => (
                  <tr key={us.email} className="hover:bg-zinc-950/30 transition">
                    <td className="py-4 px-6 font-semibold text-white">{us.email}</td>
                    <td className="py-4 px-4 text-right text-zinc-300">{us.sessions}</td>
                    <td className="py-4 px-4 text-right text-zinc-300">{us.events}</td>
                    <td className="py-4 px-4">
                      <span className="bg-indigo-600/10 text-indigo-300 text-[10px] font-mono px-2 py-0.5 rounded border border-indigo-500/20">
                        {us.funnel}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <span
                        className={`text-[10px] font-bold ${
                          us.status === "Active" ? "text-emerald-400" : "text-zinc-500"
                        }`}
                      >
                        {us.status}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-center">
                      <button className="text-zinc-500 hover:text-white transition cursor-pointer">
                        <MoreHorizontal size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
