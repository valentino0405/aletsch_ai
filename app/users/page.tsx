"use client";

import { useState, useEffect } from "react";
import DashboardLayout from "@/components/navigation/DashboardLayout";
import { Users as UsersIcon, Search, MoreHorizontal } from "lucide-react";

export default function Users() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadUsers() {
      try {
        const res = await fetch("/api/users");
        if (res.ok) {
          const json = await res.json();
          setUsers(json);
        }
      } catch (err) {
        console.error("Failed to load users list:", err);
      } finally {
        setLoading(false);
      }
    }
    loadUsers();
  }, []);

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
