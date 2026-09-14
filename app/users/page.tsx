"use client";

import { useState, useEffect } from "react";
import DashboardLayout from "@/components/navigation/DashboardLayout";
import { Users as UsersIcon, Loader2, XCircle } from "lucide-react";

interface TrackedUser {
  email?: string;
  userId?: string;
  sessions: number;
  events: number;
  funnel?: string;
  status?: string;
}

export default function Users() {
  const [users, setUsers] = useState<TrackedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadUsers() {
      try {
        const response = await fetch("/api/users");
        const data = await response.json().catch(() => []);
        if (!response.ok) {
          setError(data.error || "Users could not be loaded.");
          return;
        }
        setUsers(Array.isArray(data) ? data : []);
      } catch {
        setError("Network error while loading users.");
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
            The end users of your instrumented application, their session counts and funnel progression.
          </p>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
            <XCircle size={13} className="shrink-0" />
            {error}
          </div>
        )}

        <div className="glow-card rounded-xl overflow-hidden glow-indigo">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-900 bg-zinc-950/40 text-[10px] uppercase font-bold text-zinc-500 tracking-wider">
                  <th className="py-4 px-6">User</th>
                  <th className="py-4 px-4 text-right">Sessions</th>
                  <th className="py-4 px-4 text-right">Events Tracked</th>
                  <th className="py-4 px-4">Furthest Stage</th>
                  <th className="py-4 px-6">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900 text-xs">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-zinc-500">
                      <span className="inline-flex items-center gap-2">
                        <Loader2 size={14} className="animate-spin" /> Loading users...
                      </span>
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-zinc-500">
                      No users tracked yet. Users appear here once your instrumented application starts
                      sending events.
                    </td>
                  </tr>
                ) : (
                  users.map((user, index) => (
                    <tr key={user.userId || user.email || index} className="hover:bg-zinc-950/30 transition">
                      <td className="py-4 px-6 font-semibold text-white font-mono">
                        {user.email || user.userId || "Anonymous"}
                      </td>
                      <td className="py-4 px-4 text-right text-zinc-300">{user.sessions}</td>
                      <td className="py-4 px-4 text-right text-zinc-300">{user.events}</td>
                      <td className="py-4 px-4">
                        {user.funnel ? (
                          <span className="bg-indigo-600/10 text-indigo-300 text-[10px] font-mono px-2 py-0.5 rounded border border-indigo-500/20">
                            {user.funnel}
                          </span>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </td>
                      <td className="py-4 px-6">
                        <span
                          className={`text-[10px] font-bold ${
                            user.status === "Active" ? "text-emerald-400" : "text-zinc-500"
                          }`}
                        >
                          {user.status || "Unknown"}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
