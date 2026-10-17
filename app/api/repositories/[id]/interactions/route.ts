import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getDbOrNull } from "@/lib/mongodb";
import { ObjectId } from "mongodb";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: projectId } = await params;
    if (!projectId) {
      return NextResponse.json({ error: "Missing project ID." }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const typeFilter = searchParams.get("type") || "";
    const searchQuery = searchParams.get("search") || "";

    const db = await getDbOrNull();
    if (!db) {
      return NextResponse.json([]);
    }

    // Verify project ownership
    let project: any = null;
    try {
      project = await db.collection("projects").findOne({
        _id: new ObjectId(projectId),
        ownerId: userId,
      });
    } catch {
      project = await db.collection("projects").findOne({
        _id: projectId as any,
        ownerId: userId,
      });
    }

    if (!project) {
      return NextResponse.json({ error: "Project not found or unauthorized." }, { status: 404 });
    }

    const resolvedId = project._id.toString();

    // Build query
    const query: Record<string, unknown> = { projectId: resolvedId };

    if (typeFilter) {
      // Map display categories to interaction types
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
        query.type = { $in: types };
      }
    }

    if (searchQuery) {
      query.$or = [
        { label: { $regex: searchQuery, $options: "i" } },
        { componentName: { $regex: searchQuery, $options: "i" } },
        { filePath: { $regex: searchQuery, $options: "i" } },
        { eventName: { $regex: searchQuery, $options: "i" } },
      ];
    }

    const interactions = await db
      .collection("detectedInteractions")
      .find(query)
      .sort({ confidence: -1, filePath: 1 })
      .limit(500)
      .toArray();

    // Group by file for the dashboard display
    const grouped: Record<
      string,
      {
        filePath: string;
        fileName: string;
        route: string;
        interactions: any[];
      }
    > = {};

    for (const interaction of interactions) {
      const key = interaction.filePath;
      if (!grouped[key]) {
        grouped[key] = {
          filePath: interaction.filePath,
          fileName: interaction.filePath.split("/").pop() || interaction.filePath,
          route: interaction.route,
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

    const groupedList = Object.values(grouped).sort((a, b) =>
      a.filePath.localeCompare(b.filePath)
    );

    return NextResponse.json({
      total: interactions.length,
      grouped: groupedList,
      raw: interactions.map((i) => ({
        id: i._id.toString(),
        type: i.type,
        label: i.label,
        eventName: i.eventName,
        handler: i.handler,
        componentName: i.componentName,
        filePath: i.filePath,
        route: i.route,
        lineNumber: i.lineNumber,
        confidence: i.confidence,
        detectionMethod: i.detectionMethod,
      })),
    });
  } catch (error: any) {
    console.error("[Interactions Route] Error:", error);
    return NextResponse.json({ error: error.message || "Server Error" }, { status: 500 });
  }
}
