import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getDbOrNull } from "@/lib/mongodb";
import { ObjectId } from "mongodb";

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
      return NextResponse.json({
        components: [],
        analysis: null,
        interactions: [],
        grouped: [],
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
      components: components.map((c) => ({
        id: c._id.toString(),
        name: c.name,
        type: c.type || (c.route && c.route !== "(component)" ? "Page Layout" : "Component"),
        filePath: c.filePath,
        route: c.route,
        lineNumber: c.lineNumber,
        interactionCount: c.interactionCount || 0,
        isDefaultExport: c.isDefaultExport,
        status: "Instrumented",
        progress: "100%",
        events: c.recommendedEvent ? [c.recommendedEvent] : ["interacted"],
      })),
      grouped: groupedList,
      totalInteractions: interactions.length,
    });
  } catch (error: any) {
    console.error("[Instrumentation API] Error:", error);
    return NextResponse.json({ error: error.message || "Server Error" }, { status: 500 });
  }
}
