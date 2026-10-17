import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getDbOrNull } from "@/lib/mongodb";

/**
 * Renders an age as "32m ago".
 *
 * Alerts previously carried a stored `time` string written once at
 * creation, which meant an alert raised last week still read "Just now".
 * The age is derived from `createdAt` on read instead.
 */
function relativeTime(iso: string | undefined, now = Date.now()): string {
  if (!iso) return "Unknown";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "Unknown";

  const seconds = Math.max(0, Math.floor((now - then) / 1000));
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(then).toLocaleDateString();
}

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // No database means no alerts have been raised. Returning invented
    // ones here would put fabricated drop-off figures in front of the
    // developer as if the system had detected something.
    const db = await getDbOrNull();
    if (!db) {
      return NextResponse.json([]);
    }

    // Scope strictly to the caller's own projects.
    const projects = await db.collection("projects").find({ ownerId: userId }).toArray();
    const projectIds = projects.map((p) => p._id.toString());

    if (projectIds.length === 0) {
      return NextResponse.json([]);
    }

    const alerts = await db
      .collection("alerts")
      .find({ projectId: { $in: projectIds } })
      .sort({ createdAt: -1 })
      .limit(10)
      .toArray();

    const now = Date.now();
    const formatted = alerts.map((a) => ({
      id: a._id.toString(),
      title: a.title,
      description: a.description,
      severity: a.severity,
      category: a.category || "General",
      time: relativeTime(a.createdAt, now),
      colorClass:
        a.severity === "Critical"
          ? "border-rose-500/30 bg-rose-500/5 text-rose-400 glow-rose"
          : "border-amber-500/30 bg-amber-500/5 text-amber-400 glow-amber",
    }));

    return NextResponse.json(formatted);
  } catch (error: any) {
    console.error("Alerts API route error:", error);
    return NextResponse.json({ error: error.message || "Server Error" }, { status: 500 });
  }
}
