import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getDb } from "@/lib/mongodb";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const hasMongo = !!process.env.MONGODB_URI;
    if (!hasMongo) {
      // Mock users list fallback
      return NextResponse.json([
        { email: "john.doe@gmail.com", sessions: 12, events: 48, lastActive: "2m ago", funnel: "Task Completed", status: "Active" },
        { email: "alice.s@live.com", sessions: 8, events: 32, lastActive: "15m ago", funnel: "Create Task", status: "Active" },
        { email: "bob.dev@yahoo.com", sessions: 2, events: 8, lastActive: "1h ago", funnel: "Login", status: "Inactive" },
        { email: "clara.w@outlook.com", sessions: 1, events: 2, lastActive: "2h ago", funnel: "Sign Up", status: "Inactive" },
      ]);
    }

    const db = await getDb();

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
