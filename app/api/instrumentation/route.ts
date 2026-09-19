import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getDbOrNull } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { fallbackStore } from "@/lib/fallback-store";

/**
 * Instrumentation state for one component.
 *
 * Detecting an interaction is not the same as instrumenting it. A
 * component only counts as instrumented once a plan has actually been
 * applied to the repository, so the status is derived from applied
 * plans — never assumed from the fact that analysis ran.
 */
function componentState(
  filePath: string,
  proposedEvents: string[],
  liveEventsByFile: Map<string, string[]>,
  pendingFiles: Set<string>
) {
  const live = liveEventsByFile.get(filePath);

  if (live && live.length > 0) {
    return {
      status: "Instrumented",
      instrumented: true,
      events: live,
      eventsAreLive: true,
      coverage: `${live.length}/${Math.max(proposedEvents.length, live.length)} events live`,
    };
  }

  if (pendingFiles.has(filePath)) {
    return {
      status: "Pending review",
      instrumented: false,
      events: proposedEvents,
      eventsAreLive: false,
      coverage: `${proposedEvents.length} proposed`,
    };
  }

  return {
    status: "Not instrumented",
    instrumented: false,
    events: proposedEvents,
    eventsAreLive: false,
    coverage: proposedEvents.length > 0 ? `${proposedEvents.length} proposed` : "No events detected",
  };
}

export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");
    const typeFilter = searchParams.get("type") || "";
    const searchQuery = searchParams.get("search") || "";

    const db = await getDbOrNull();
    if (!db) {
      const result = projectId ? fallbackStore.getAnalysisResult(projectId) : null;
      const components = result?.components || [];
      const interactions = result?.interactions || [];
      // Nothing can have been applied in fallback mode — there is no
      // persistence layer to record an applied plan in.
      const noneLive = new Map<string, string[]>();
      const nonePending = new Set<string>();

      return NextResponse.json({
        components: components.map((component: any, index: number) => {
          const proposed = interactions
            .filter(
              (item: any) =>
                item.componentName === component.name && item.filePath === component.filePath
            )
            .map((item: any) => item.eventName)
            .filter(Boolean);

          return {
            id: `fb_component_${index}`,
            name: component.name,
            type: component.route && component.route !== "(component)" ? "Page Layout" : "Component",
            filePath: component.filePath,
            route: component.route,
            lineNumber: component.lineNumber,
            interactionCount: component.interactionCount || 0,
            ...componentState(component.filePath, Array.from(new Set(proposed)), noneLive, nonePending),
          };
        }),
        analysis: result ? { status: result.status, filesScanned: result.filesScanned, filesParsed: result.filesParsed, componentsDetected: components.length, interactionsDetected: interactions.length } : null,
        interactions,
        grouped: [],
        job: projectId ? fallbackStore.getLatestJob(projectId) || null : null,
      });
    }

    // Determine which project IDs to query
    let projectIds: string[] = [];

    if (projectId) {
      // Verify ownership
      let project: any = null;
      try {
        project = await db
          .collection("projects")
          .findOne({ _id: new ObjectId(projectId), ownerId: userId });
      } catch {
        project = await db
          .collection("projects")
          .findOne({ _id: projectId as any, ownerId: userId });
      }
      if (!project) {
        return NextResponse.json({ error: "Project not found or unauthorized." }, { status: 404 });
      }
      projectIds = [project._id.toString()];
    } else {
      const projects = await db
        .collection("projects")
        .find({ ownerId: userId })
        .toArray();
      projectIds = projects.map((p) => p._id.toString());
    }

    if (projectIds.length === 0) {
      return NextResponse.json({
        components: [],
        analysis: null,
        interactions: [],
        grouped: [],
      });
    }

    // ── Fetch latest analysis for each project ─────────────
    const latestAnalyses = await db
      .collection("repositoryAnalysis")
      .find({ projectId: { $in: projectIds } })
      .sort({ createdAt: -1 })
      .limit(5)
      .toArray();

    const latestAnalysis = latestAnalyses[0] || null;

    // ── Fetch latest job ────────────────────────────────────
    const latestJob = await db
      .collection("analysisJobs")
      .find({ projectId: { $in: projectIds } })
      .sort({ createdAt: -1 })
      .limit(1)
      .toArray();

    const job = latestJob[0] || null;

    // ── Build interaction query with optional filters ────────
    const interactionQuery: Record<string, unknown> = {
      projectId: { $in: projectIds },
    };

    if (typeFilter) {
      const typeMap: Record<string, string[]> = {
        buttons: ["button_click"],
        forms: ["form_submit"],
        navigation: ["navigation"],
        inputs: ["input_change", "input_focus", "input_blur"],
        selection: ["selection_change", "tab_change", "checkbox_change"],
        authentication: ["authentication"],
        repository: ["repository_connection"],
        modals: ["modal_open", "modal_close"],
      };
      const types = typeMap[typeFilter.toLowerCase()];
      if (types) {
        interactionQuery.type = { $in: types };
      }
    }

    if (searchQuery) {
      interactionQuery.$or = [
        { label: { $regex: searchQuery, $options: "i" } },
        { componentName: { $regex: searchQuery, $options: "i" } },
        { filePath: { $regex: searchQuery, $options: "i" } },
        { eventName: { $regex: searchQuery, $options: "i" } },
      ];
    }

    // Fetch detected interactions
    const interactions = await db
      .collection("detectedInteractions")
      .find(interactionQuery)
      .sort({ confidence: -1 })
      .limit(500)
      .toArray();

    // Group by file
    const grouped: Record<string, any> = {};
    for (const interaction of interactions) {
      const key = interaction.filePath;
      if (!grouped[key]) {
        grouped[key] = {
          filePath: interaction.filePath,
          fileName: interaction.filePath.split("/").pop() || interaction.filePath,
          route: interaction.route || "(component)",
          interactions: [],
        };
      }
      grouped[key].interactions.push({
        id: interaction._id.toString(),
        type: interaction.type,
        label: interaction.label,
        eventName: interaction.eventName,
        handler: interaction.handler,
        componentName: interaction.componentName,
        lineNumber: interaction.lineNumber,
        confidence: interaction.confidence,
        detectionMethod: interaction.detectionMethod,
        metadata: interaction.metadata,
      });
    }

    const groupedList = Object.values(grouped).sort((a: any, b: any) =>
      a.filePath.localeCompare(b.filePath)
    );

    // ── Fetch components ────────────────────────────────────
    const components = await db
      .collection("components")
      .find({ projectId: { $in: projectIds } })
      .sort({ interactionCount: -1 })
      .limit(50)
      .toArray();

    // ── Derive real instrumentation state ───────────────────
    // A component is "Instrumented" only if a plan that touches its file
    // has actually been applied (a PR opened / branch pushed). Pending
    // plans mark the file as under review. Everything else is untouched.
    const plans = await db
      .collection("instrumentationPlans")
      .find({ projectId: { $in: projectIds } })
      .sort({ createdAt: -1 })
      .toArray();

    const liveEventsByFile = new Map<string, string[]>();
    const pendingFiles = new Set<string>();
    for (const plan of plans) {
      const planFiles: Array<{ path: string; events?: string[] }> = plan.files || [];
      if (plan.status === "applied") {
        for (const file of planFiles) {
          if (!file.events || file.events.length === 0) continue;
          const merged = new Set([...(liveEventsByFile.get(file.path) || []), ...file.events]);
          liveEventsByFile.set(file.path, Array.from(merged));
        }
      } else if (plan.status === "proposed" || plan.status === "previewed") {
        for (const file of planFiles) pendingFiles.add(file.path);
      }
    }

    // Proposed events per file come from detected interactions.
    const proposedByFile = new Map<string, Set<string>>();
    for (const interaction of interactions) {
      if (!interaction.eventName) continue;
      const set = proposedByFile.get(interaction.filePath) || new Set<string>();
      set.add(interaction.eventName);
      proposedByFile.set(interaction.filePath, set);
    }

    const latestPlan = plans[0] || null;

    // Counted, not inferred: how many events this project has actually
    // received. Zero here with a non-zero instrumented count means the
    // code is wired up but no traffic has reached the ingest endpoint.
    const eventsReceived = await db
      .collection("events")
      .countDocuments({ projectId: { $in: projectIds } });

    return NextResponse.json({
      analysis: latestAnalysis
        ? {
            id: latestAnalysis._id.toString(),
            status: latestAnalysis.status,
            filesScanned: latestAnalysis.filesScanned,
            filesParsed: latestAnalysis.filesParsed,
            filesSkipped: latestAnalysis.filesSkipped,
            parseErrors: latestAnalysis.parseErrors,
            componentsDetected: latestAnalysis.componentsDetected,
            routesDetected: latestAnalysis.routesDetected,
            interactionsDetected: latestAnalysis.interactionsDetected,
            routes: latestAnalysis.routes || [],
            errors: latestAnalysis.errors || [],
            startedAt: latestAnalysis.startedAt,
            completedAt: latestAnalysis.completedAt,
          }
        : null,
      job: job
        ? {
            id: job._id.toString(),
            status: job.status,
            progress: job.progress || 0,
            currentStep: job.currentStep || "",
            startedAt: job.startedAt,
            completedAt: job.completedAt,
          }
        : null,
      components: components.map((c) => {
        const proposed = Array.from(proposedByFile.get(c.filePath) || []);
        return {
          id: c._id.toString(),
          name: c.name,
          type: c.type || (c.route && c.route !== "(component)" ? "Page Layout" : "Component"),
          filePath: c.filePath,
          route: c.route,
          lineNumber: c.lineNumber,
          interactionCount: c.interactionCount || 0,
          isDefaultExport: c.isDefaultExport,
          ...componentState(c.filePath, proposed, liveEventsByFile, pendingFiles),
        };
      }),
      grouped: groupedList,
      totalInteractions: interactions.length,
      // The most recent plan, so the UI can tell "events generated" from
      // "events committed to a branch". Without this the pipeline view
      // has no way to know an apply ever happened and pins the last two
      // stages to "future" forever.
      plan: latestPlan
        ? {
            status: latestPlan.status,
            branch: latestPlan.branch || null,
            baseBranch: latestPlan.baseBranch || null,
            pullRequest: latestPlan.pullRequest || null,
            eventCount: Array.isArray(latestPlan.approvedEventNames)
              ? latestPlan.approvedEventNames.length
              : 0,
            fileCount: Array.isArray(latestPlan.files) ? latestPlan.files.length : 0,
            createdAt: latestPlan.createdAt || null,
          }
        : null,
      // Events that exist in committed code vs. events actually received
      // from the running application. These are different claims and the
      // dashboard must not present the first as if it were the second.
      eventsInstrumented: Array.from(liveEventsByFile.values()).reduce(
        (total, events) => total + events.length,
        0
      ),
      eventsReceived,
    });
  } catch (error: any) {
    console.error("[Instrumentation API] Error:", error);
    return NextResponse.json({ error: error.message || "Server Error" }, { status: 500 });
  }
}
