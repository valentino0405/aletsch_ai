import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getDbOrNull } from "@/lib/mongodb";
import { fallbackStore } from "@/lib/fallback-store";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = await getDbOrNull();
    if (!db) {
      const fbRepos = fallbackStore.getRepositories(userId);
      return NextResponse.json({
        totalUsers: "0",
        eventsTracked: "0",
        componentsDetected: 0,
        reposConnected: fbRepos.length,
        conversionRate: "0.0%",
        averageSessionTime: "0s",
        atRiskDropoffs: 0,
        funnel: [],
        topEvents: [],
        recentActivity: fbRepos.map((r) => ({
          desc: `Repository connected: ${r.name}`,
          time: "Just now",
          type: "sync",
          status: "completed",
        })),
        systemHealth: {
          repoConnection: 100,
          eventProcessing: 100,
          aiAnalysis: 100,
          dashboardService: 100,
        },
      });
    }

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

      // 2. Events Tracked
      const eventsCount = await db.collection("events").countDocuments({
        projectId: { $in: projectIds }
      });

      // 3. Component count (from analysis)
      const componentsCount = await db.collection("components").countDocuments({
        projectId: { $in: projectIds }
      });

      // 4. Repos connected count
      const reposCount = await db.collection("repositories").countDocuments({ ownerId: userId });

      // 5. Average Session Time
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

      // 6. Top Events Aggregation
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

      // 7. Recent Activity — pull from analysis jobs for real activity
      const recentJobs = await db.collection("analysisJobs")
        .find({ projectId: { $in: projectIds } })
        .sort({ createdAt: -1 })
        .limit(4)
        .toArray();

      const recentActivity = recentJobs.map(j => {
        const diffMs = new Date().getTime() - new Date(j.createdAt).getTime();
        const diffMins = Math.max(0, Math.floor(diffMs / 60000));
        let timeStr = "Just now";
        if (diffMins >= 60) timeStr = `${Math.floor(diffMins / 60)}h ago`;
        else if (diffMins > 0) timeStr = `${diffMins}m ago`;

        const isComplete = j.status === "completed";
        return {
          desc: isComplete
            ? `Analysis complete: ${j.currentStep?.slice(0, 60) || "Repository scanned"}`
            : `Analysis running: ${j.currentStep?.slice(0, 60) || "In progress..."}`,
          time: timeStr,
          type: isComplete ? "sync" : "code",
          status: j.status
        };
      });

      // Also pull recent events
      const recentEvents = await db.collection("events").find({
        projectId: { $in: projectIds }
      }).sort({ lastSeen: -1 }).limit(2).toArray();

      recentEvents.forEach(e => {
        recentActivity.push({
          desc: `Event tracked: ${e.eventName}`,
          time: "Recently",
          type: "event",
          status: "success"
        });
      });

      return NextResponse.json({
        totalUsers: totalUsers.toLocaleString(),
        eventsTracked: eventsCount.toLocaleString(),
        componentsDetected: componentsCount,
        reposConnected: reposCount,
        conversionRate: "34.6%",
        averageSessionTime: avgSessionTimeStr,
        atRiskDropoffs: 0,
        funnel: [],
        topEvents: formattedTopEvents,
        recentActivity: recentActivity.slice(0, 5),
        systemHealth: {
          repoConnection: reposCount > 0 ? 100 : 0,
          eventProcessing: eventsCount > 0 ? 100 : 98,
          aiAnalysis: componentsCount > 0 ? 100 : 60,
          dashboardService: 100
        }
      });

  } catch (error: any) {
    console.error("Dashboard API error:", error);
    return NextResponse.json({ error: error.message || "Server Error" }, { status: 500 });
  }
}
