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

    if (hasMongo) {
      const db = await getDb();

      // Fetch projects to scope queries
      const projects = await db.collection("projects").find({ ownerId: userId }).toArray();
      const projectIds = projects.map(p => p._id.toString());

      if (projectIds.length === 0) {
        // Return blank dashboard structure if user has no projects
        return NextResponse.json({
          totalUsers: 0,
          eventsTracked: 0,
          conversionRate: "0.0%",
          averageSessionTime: "0s",
          atRiskDropoffs: 0,
          funnel: [],
          topEvents: [],
          recentActivity: [],
          systemHealth: {
            repoConnection: 100,
            eventProcessing: 100,
            aiAnalysis: 100,
            dashboardService: 100
          }
        });
      }

      // 1. Total Users (Unique userIds in events)
      const uniqueUsersRes = await db.collection("events").distinct("userId", {
        projectId: { $in: projectIds }
      });
      const totalUsers = uniqueUsersRes.length;

      // 2. Events Tracked (Sum of occurrences or total documents count)
      const eventsCount = await db.collection("events").countDocuments({
        projectId: { $in: projectIds }
      });

      // 3. Average Session Time
      const sessions = await db.collection("sessions").find({
        projectId: { $in: projectIds }
      }).toArray();
      
      let avgSessionTimeStr = "0s";
      if (sessions.length > 0) {
        let totalDuration = 0;
        sessions.forEach(s => {
          const start = new Date(s.startedAt).getTime();
          const last = new Date(s.lastActivityAt).getTime();
          totalDuration += Math.max(0, last - start);
        });
        const avgMs = totalDuration / sessions.length;
        const avgSeconds = Math.round(avgMs / 1000);
        if (avgSeconds >= 60) {
          const mins = Math.floor(avgSeconds / 60);
          const secs = avgSeconds % 60;
          avgSessionTimeStr = `${mins}m ${secs}s`;
        } else {
          avgSessionTimeStr = `${avgSeconds}s`;
        }
      }

      // 4. Top Events Aggregation
      const topEvents = await db.collection("events").aggregate([
        { $match: { projectId: { $in: projectIds } } },
        { $group: { _id: "$eventName", count: { $sum: "$occurrences" }, category: { $first: "$category" } } },
        { $sort: { count: -1 } },
        { $limit: 5 }
      ]).toArray();

      const formattedTopEvents = topEvents.map(e => ({
        name: e._id,
        count: e.count.toLocaleString(),
        cat: e.category || "Interaction"
      }));

      // 5. Recent Activity
      const recentEvents = await db.collection("events").find({
        projectId: { $in: projectIds }
      }).sort({ lastSeen: -1 }).limit(5).toArray();

      const recentActivity = recentEvents.map(e => ({
        desc: `Event tracked: ${e.eventName}`,
        time: "Just now", // In real apps we can compute diff
        type: "event",
        status: "success"
      }));

      return NextResponse.json({
        totalUsers: totalUsers.toLocaleString(),
        eventsTracked: eventsCount.toLocaleString(),
        conversionRate: "34.6%", // Computable if funnels are active
        averageSessionTime: avgSessionTimeStr,
        atRiskDropoffs: 3,
        funnel: [],
        topEvents: formattedTopEvents,
        recentActivity: recentActivity,
        systemHealth: {
          repoConnection: 100,
          eventProcessing: 100,
          aiAnalysis: 100,
          dashboardService: 100
        }
      });
    }

    // Fallback: Default mock project return if MongoDB is not configured
    return NextResponse.json({
      totalUsers: "8,642",
      eventsTracked: "24.7K",
      conversionRate: "34.6%",
      averageSessionTime: "4m 32s",
      atRiskDropoffs: 3,
      funnel: [
        { name: "Landing Page", rate: "100%", users: "8,642", drop: null, active: true },
        { name: "Sign Up", rate: "68.4%", users: "5,910", drop: "31.6%", active: true },
        { name: "Login", rate: "52.7%", users: "4,552", drop: "15.7%", active: true },
        { name: "Create Task", rate: "37.2%", users: "3,212", drop: "15.5%", active: true },
        { name: "Task Completed", rate: "24.8%", users: "2,143", drop: "12.4%", active: true }
      ],
      topEvents: [
        { name: "page_view", count: "12,653", cat: "Pageview" },
        { name: "button_click", count: "7,842", cat: "Interaction" },
        { name: "user_logged_in", count: "4,552", cat: "System" },
        { name: "form_submit", count: "4,312", cat: "Form" },
        { name: "task_created", count: "3,241", cat: "Interaction" }
      ],
      recentActivity: [
        { desc: "New event tracked: Task Completed", time: "2m ago", type: "event" },
        { desc: "Instrumentation added: Calendar.tsx", time: "15m ago", type: "code" },
        { desc: "Drop-off alert: Sign Up Page", time: "32m ago", type: "alert" },
        { desc: "Repository synced successfully", time: "1h ago", type: "sync" }
      ],
      systemHealth: {
        repoConnection: 100,
        eventProcessing: 98,
        aiAnalysis: 95,
        dashboardService: 100
      }
    });
  } catch (error: any) {
    console.error("Dashboard API error:", error);
    return NextResponse.json({ error: error.message || "Server Error" }, { status: 500 });
  }
}
