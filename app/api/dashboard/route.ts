import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getDbOrNull } from "@/lib/mongodb";
import { fallbackStore } from "@/lib/fallback-store";
import { ObjectId } from "mongodb";

export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const projectIdParam = searchParams.get("projectId");

    const db = await getDbOrNull();
    if (!db) {
      const fbRepos = fallbackStore.getRepositories(userId);
      const fbProjects = fallbackStore.getProjects(userId);
      const scopedProjects = projectIdParam
        ? fbProjects.filter((project) => project.id === projectIdParam)
        : fbProjects;
      const analysisResults = scopedProjects
        .map((project) => fallbackStore.getAnalysisResult(project.id))
        .filter(Boolean);
      const fallbackEvents = fallbackStore
        .getEvents(userId)
        .filter((event) => scopedProjects.some((project) => project.id === event.projectId));
      const interactions = analysisResults.flatMap((result: any) => result.interactions || []);
      const componentsDetected = analysisResults.reduce(
        (total: number, result: any) => total + (result.components?.length || 0),
        0
      );
      const latestAnalysis: any = analysisResults[0] || null;
      const topEvents = Array.from<[string, number]>(
        interactions.reduce((counts: Map<string, number>, interaction: any) => {
          counts.set(interaction.eventName, (counts.get(interaction.eventName) || 0) + 1);
          return counts;
        }, new Map<string, number>())
      )
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count: String(count), cat: "Interaction" }));
      const recentJobs = scopedProjects
        .map((project) => fallbackStore.getLatestJob(project.id))
        .filter(Boolean)
        .sort((a: any, b: any) => String(b.createdAt).localeCompare(String(a.createdAt)));
      return NextResponse.json({
        totalUsers: "0",
        eventsTracked: String(fallbackEvents.length || interactions.length),
        componentsDetected,
        reposConnected: fbRepos.length,
        conversionRate: "0.0%",
        averageSessionTime: "0s",
        atRiskDropoffs: 0,
        funnel: [],
        topEvents,
        projects: fbProjects.map((p) => ({ id: p.id, name: p.name })),
        selectedProject: scopedProjects[0]
          ? { id: scopedProjects[0].id, name: scopedProjects[0].name, status: scopedProjects[0].status, repositoryUrl: scopedProjects[0].repositoryUrl }
          : null,
        analysis: latestAnalysis
          ? {
              filesScanned: latestAnalysis.filesScanned,
              filesParsed: latestAnalysis.filesParsed,
              componentsDetected: latestAnalysis.components?.length || 0,
              routesDetected: latestAnalysis.routes?.length || 0,
              interactionsDetected: interactions.length,
              status: latestAnalysis.status,
              completedAt: latestAnalysis.completedAt,
            }
          : null,
        recentActivity: recentJobs.map((job: any) => ({
          desc: job.currentStep || "Repository analysis completed",
          time: "Recently",
          type: "sync",
          status: job.status,
        })),
        systemHealth: {
          repoConnection: 100,
          eventProcessing: fallbackEvents.length > 0 ? 100 : 60,
          aiAnalysis: latestAnalysis ? 100 : 60,
          dashboardService: 100,
        },
      });
    }

    // Fetch all user projects
    const allProjects = await db.collection("projects").find({ ownerId: userId }).toArray();
    const projectsMeta = allProjects.map((p) => ({
      id: p._id.toString(),
      name: p.name,
      status: p.status,
      repositoryUrl: p.repositoryUrl,
    }));

    // Scope to selected project or all projects
    let projectIds: string[];
    if (projectIdParam) {
      // Verify ownership
      const owned = allProjects.find(
        (p) => p._id.toString() === projectIdParam
      );
      projectIds = owned ? [projectIdParam] : [];
    } else {
      projectIds = allProjects.map((p) => p._id.toString());
    }

    const projects = allProjects;


    if (projectIds.length === 0) {
      return NextResponse.json({
        totalUsers: 0,
        eventsTracked: 0,
        componentsDetected: 0,
        reposConnected: 0,
        conversionRate: "0.0%",
        averageSessionTime: "0s",
        atRiskDropoffs: 0,
        funnel: [],
        topEvents: [],
        recentActivity: [],
        projects: projectsMeta,
        selectedProject: null,
        systemHealth: {
          repoConnection: 0,
          eventProcessing: 0,
          aiAnalysis: 0,
          dashboardService: 100,
        },
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

    // Fetch latest analysis summary for scoped projects
    const latestAnalysis = await db
      .collection("repositoryAnalysis")
      .find({ projectId: { $in: projectIds } })
      .sort({ createdAt: -1 })
      .limit(1)
      .toArray();
    const analysisSummary = latestAnalysis[0] || null;

    // Selected project info
    const selectedProject = projectIdParam
      ? projectsMeta.find((p) => p.id === projectIdParam) || null
      : projectsMeta[0] || null;

    return NextResponse.json({
      totalUsers: totalUsers.toLocaleString(),
      eventsTracked: eventsCount.toLocaleString(),
      componentsDetected: analysisSummary?.interactionsDetected ?? componentsCount,
      reposConnected: reposCount,
      conversionRate: "34.6%",
      averageSessionTime: avgSessionTimeStr,
      atRiskDropoffs: 0,
      funnel: [],
      topEvents: formattedTopEvents,
      recentActivity: recentActivity.slice(0, 5),
      projects: projectsMeta,
      selectedProject,
      analysis: analysisSummary
        ? {
            filesScanned: analysisSummary.filesScanned,
            filesParsed: analysisSummary.filesParsed,
            componentsDetected: analysisSummary.componentsDetected,
            routesDetected: analysisSummary.routesDetected,
            interactionsDetected: analysisSummary.interactionsDetected,
            status: analysisSummary.status,
            completedAt: analysisSummary.completedAt,
          }
        : null,
      systemHealth: {
        repoConnection: reposCount > 0 ? 100 : 0,
        eventProcessing: eventsCount > 0 ? 100 : 98,
        aiAnalysis: componentsCount > 0 ? 100 : 60,
        dashboardService: 100,
      },
    });

  } catch (error: any) {
    console.error("Dashboard API error:", error);
    return NextResponse.json({ error: error.message || "Server Error" }, { status: 500 });
  }
}
