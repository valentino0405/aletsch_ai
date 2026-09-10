import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getDb } from "@/lib/mongodb";
import { getDbOrNull } from "@/lib/mongodb";
import { fallbackStore } from "@/lib/fallback-store";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const dbOrNull = await getDbOrNull();
    if (!dbOrNull) {
      const events = fallbackStore.getEvents(userId);
      const grouped = new Map<string, any>();
      for (const event of events) {
        const current = grouped.get(event.userId) || { email: event.userId, sessions: new Set<string>(), events: 0, lastActive: event.timestamp, exitPath: event.path };
        current.sessions.add(event.sessionId || "session_default");
        current.events += 1;
        if (new Date(event.timestamp).getTime() > new Date(current.lastActive).getTime()) {
          current.lastActive = event.timestamp;
          current.exitPath = event.path;
        }
        grouped.set(event.userId, current);
      }
      return NextResponse.json(Array.from(grouped.values()).map((item: any) => ({
        email: item.email,
        sessions: item.sessions.size,
        events: item.events,
        lastActive: "Recently",
        funnel: item.exitPath || "Landing Page",
        status: "Active",
      })));
    }

    const db = dbOrNull;

    // Fetch projects to scope queries
    const projects = await db.collection("projects").find({ ownerId: userId }).toArray();
    const projectIds = projects.map(p => p._id.toString());

    if (projectIds.length === 0) {
      return NextResponse.json([]);
    }

    // Aggregate sessions to group by userId
    const usersAgg = await db.collection("sessions").aggregate([
      { $match: { projectId: { $in: projectIds } } },
      {
        $group: {
          _id: "$userId",
          sessionCount: { $sum: 1 },
          eventCount: { $sum: "$eventCount" },
          lastActiveDate: { $max: "$lastActivityAt" },
          exitPath: { $first: "$exitPath" }
        }
      },
      { $sort: { lastActiveDate: -1 } }
    ]).toArray();

    const formatted = usersAgg.map(u => {
      const diffMs = new Date().getTime() - new Date(u.lastActiveDate).getTime();
      const diffMins = Math.max(0, Math.floor(diffMs / (1000 * 60)));
      
      let lastActive = "Just now";
      if (diffMins >= 60) {
        const hours = Math.floor(diffMins / 60);
        lastActive = `${hours}h ago`;
      } else if (diffMins > 0) {
        lastActive = `${diffMins}m ago`;
      }

      const status = diffMins < 30 ? "Active" : "Inactive";

      // Map exit path to a readable funnel stage representation
      let funnel = "Landing Page";
      if (u.exitPath === "/sign-up") funnel = "Sign Up";
      else if (u.exitPath === "/login" || u.exitPath === "/sign-in") funnel = "Login";
      else if (u.exitPath === "/dashboard") funnel = "Dashboard";
      else if (u.exitPath && u.exitPath.includes("task")) funnel = "Task Created";

      return {
        email: u._id,
        sessions: u.sessionCount,
        events: u.eventCount,
        lastActive,
        funnel,
        status
      };
    });

    return NextResponse.json(formatted);
  } catch (error: any) {
    console.error("Users API route error:", error);
    return NextResponse.json({ error: error.message || "Server Error" }, { status: 500 });
  }
}
