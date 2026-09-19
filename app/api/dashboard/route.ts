import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getDbOrNull } from "@/lib/mongodb";
import { fallbackStore } from "@/lib/fallback-store";
import { resolveFunnel, formatRate } from "@/lib/analytics/funnel";
import { computeTrends } from "@/lib/analytics/trends";
import { AIService } from "@/lib/ai/client";

/**
 * The time windows the dashboard's range picker can ask for. The picker used
 * to be decorative — every response was a fixed 7 days regardless of the
 * selection — so the label and the numbers could disagree. The window is now
 * a real parameter, and the response echoes back the one it actually used.
 */
const RANGES: Record<string, { days: number; label: string }> = {
  "1d": { days: 1, label: "Today" },
  "7d": { days: 7, label: "Last 7 days" },
  "30d": { days: 30, label: "Last 30 days" },
};
const DEFAULT_RANGE = "7d";

function resolveRange(param: string | null) {
  const key = param && RANGES[param] ? param : DEFAULT_RANGE;
  const { days, label } = RANGES[key];
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - (days - 1));
  start.setUTCHours(0, 0, 0, 0);
  return { key, days, label, startIso: start.toISOString() };
}

/** A flat, explicitly empty trend block for the no-data branches. */
function emptyTrends(days = 7, window = DEFAULT_RANGE) {
  const series = Array.from({ length: days }, (_, index) => {
    const day = new Date();
    day.setUTCDate(day.getUTCDate() - (days - 1 - index));
    return { date: day.toISOString().slice(0, 10), events: 0, users: 0 };
  });
  const noChange = { percent: null, direction: "flat" as const, label: "No prior data" };
  return {
    window,
    hasData: false,
    series,
    eventSparkline: series.map(() => 0),
    userSparkline: series.map(() => 0),
    users: noChange,
    events: noChange,
  };
}

export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const projectIdParam = searchParams.get("projectId");
    const range = resolveRange(searchParams.get("range"));
    // Every event-derived count below is filtered by this, so the selected
    // range and the numbers on screen describe the same period.
    const inRange = { timestamp: { $gte: range.startIso } };

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
        range: { key: range.key, label: range.label, days: range.days },
        storage: "in-memory",
        totalUsers: "0",
        eventsTracked: String(fallbackEvents.length || interactions.length),
        componentsDetected,
        reposConnected: fbRepos.length,
        conversionRate: formatRate(null),
        averageSessionTime: "0s",
        atRiskDropoffs: 0,
        funnel: [],
        funnelMeta: { name: null, source: null, largestDropoff: null, insufficientData: true },
        trends: emptyTrends(range.days, range.key),
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
          repoConnection: {
            state: fbRepos.length > 0 ? "ok" : "idle",
            detail: fbRepos.length > 0
              ? `${fbRepos.length} repositor${fbRepos.length === 1 ? "y" : "ies"} connected`
              : "No repository connected",
          },
          eventProcessing: {
            state: fallbackEvents.length > 0 ? "ok" : "idle",
            detail: fallbackEvents.length > 0
              ? `${fallbackEvents.length} events held in memory`
              : "No events received yet",
          },
          aiAnalysis: {
            state: latestAnalysis ? "ok" : "idle",
            detail: latestAnalysis ? "Analysis completed" : "No analysis has completed yet",
          },
          // The database is unreachable, so nothing here survives a restart.
          dashboardService: { state: "degraded", detail: "In-memory store — no database" },
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

    if (projectIds.length === 0) {
      return NextResponse.json({
        range: { key: range.key, label: range.label, days: range.days },
        totalUsers: 0,
        eventsTracked: 0,
        componentsDetected: 0,
        reposConnected: 0,
        conversionRate: formatRate(null),
        averageSessionTime: "0s",
        atRiskDropoffs: 0,
        funnel: [],
        funnelMeta: { name: null, source: null, largestDropoff: null, insufficientData: true },
        trends: emptyTrends(range.days, range.key),
        topEvents: [],
        recentActivity: [],
        projects: projectsMeta,
        selectedProject: null,
        systemHealth: {
          repoConnection: { state: "idle", detail: "No repository connected" },
          eventProcessing: { state: "idle", detail: "No events received yet" },
          aiAnalysis: { state: "idle", detail: "No analysis has completed yet" },
          dashboardService: { state: "ok", detail: "Responding" },
        },
      });
    }

      // 1. Total Users (Unique userIds in events within the selected range)
      const uniqueUsersRes = await db.collection("events").distinct("userId", {
        projectId: { $in: projectIds },
        ...inRange,
      });
      const totalUsers = uniqueUsersRes.length;

      // 2. Events Tracked
      const eventsCount = await db.collection("events").countDocuments({
        projectId: { $in: projectIds },
        ...inRange,
      });

      // 3. Component count (from analysis)
      const componentsCount = await db.collection("components").countDocuments({
        projectId: { $in: projectIds }
      });

      // 4. Repos connected count
      const reposCount = await db.collection("repositories").countDocuments({ ownerId: userId });

      // 4b. Whether the AI layer has actually produced anything. A key
      // being present proves nothing — OpenRouter retires model slugs,
      // and every call 404s while `isConfigured()` still returns true.
      // `grounding.aiGenerated` is set only when a model really wrote
      // the insight, so counting those is the honest health signal.
      const aiConfigured = AIService.isConfigured();
      const aiAuthoredInsights = await db.collection("insights").countDocuments({
        projectId: { $in: projectIds },
        "grounding.aiGenerated": true,
      });

      // 5. Average Session Time (sessions that started inside the range)
      const sessions = await db.collection("sessions").find({
        projectId: { $in: projectIds },
        startedAt: { $gte: range.startIso },
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
        { $match: { projectId: { $in: projectIds }, ...inRange } },
        { $group: { _id: "$eventName", count: { $sum: "$occurrences" }, category: { $first: "$category" } } },
        { $sort: { count: -1 } },
        { $limit: 5 }
      ]).toArray();

      const formattedTopEvents = topEvents.map(e => ({
        name: e._id,
        count: e.count.toLocaleString(),
        cat: e.category || "Interaction"
      }));

      // 6b. Funnel — derived from events this project actually emitted.
      // `resolveFunnel` returns null when there is nothing to measure, and
      // the response says so rather than showing a zeroed-out funnel.
      const funnelResult = await resolveFunnel(db, projectIds);
      const trends = await computeTrends(db, projectIds, range.days);
      const funnel = (funnelResult?.steps ?? []).map((step) => ({
        name: step.name,
        event: step.event,
        users: step.users,
        percent: step.percent,
        drop: step.drop,
        dropFromPrevious: step.dropFromPrevious,
        active: true,
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
      range: { key: range.key, label: range.label, days: range.days },
      totalUsers: totalUsers.toLocaleString(),
      eventsTracked: eventsCount.toLocaleString(),
      componentsDetected: analysisSummary?.interactionsDetected ?? componentsCount,
      reposConnected: reposCount,
      conversionRate: formatRate(funnelResult?.conversionRate ?? null),
      averageSessionTime: avgSessionTimeStr,
      atRiskDropoffs: funnelResult?.atRiskCount ?? 0,
      funnel,
      funnelMeta: funnelResult
        ? {
            name: funnelResult.funnelName,
            source: funnelResult.source,
            largestDropoff: funnelResult.largestDropoff,
            insufficientData: funnelResult.insufficientData,
          }
        : { name: null, source: null, largestDropoff: null, insufficientData: true },
      topEvents: formattedTopEvents,
      trends: {
        window: range.key,
        hasData: trends.hasData,
        series: trends.series,
        eventSparkline: trends.eventSparkline,
        userSparkline: trends.userSparkline,
        users: trends.users,
        events: trends.events,
      },
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
      // Subsystem states, each backed by a count this request actually made.
      // These used to be percentages like 98 and 60, which were invented —
      // nothing measured them. A subsystem is either doing work, idle with
      // nothing to do yet, or not configured.
      systemHealth: {
        repoConnection: {
          state: reposCount > 0 ? "ok" : "idle",
          detail: reposCount > 0
            ? `${reposCount} repositor${reposCount === 1 ? "y" : "ies"} connected`
            : "No repository connected",
        },
        eventProcessing: {
          state: eventsCount > 0 ? "ok" : "idle",
          detail: eventsCount > 0
            ? `${eventsCount.toLocaleString()} events in ${range.label.toLowerCase()}`
            : "No events received yet",
        },
        aiAnalysis: {
          // This used to report `componentsCount`, which is produced by
          // the AST parser, not by a model — so it read "Operational"
          // the whole time every LLM call was failing on a retired
          // model slug. Provenance is recorded on the insight itself.
          state: !aiConfigured ? "off" : aiAuthoredInsights > 0 ? "ok" : "idle",
          detail: !aiConfigured
            ? "OPENROUTER_API_KEY is not set — rule engine only"
            : aiAuthoredInsights > 0
              ? `${aiAuthoredInsights} model-authored insight${aiAuthoredInsights === 1 ? "" : "s"}`
              : "Key configured; no insight has been model-authored yet",
        },
        codeAnalysis: {
          state: componentsCount > 0 ? "ok" : "idle",
          detail: componentsCount > 0
            ? `${componentsCount.toLocaleString()} components detected`
            : "No analysis has completed yet",
        },
        dashboardService: { state: "ok", detail: "Responding" },
      },
    });

  } catch (error: any) {
    console.error("Dashboard API error:", error);
    return NextResponse.json({ error: error.message || "Server Error" }, { status: 500 });
  }
}
