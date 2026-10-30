import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getDbOrNull } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { createInstrumentationPreview } from "@/lib/instrumentation/preview";

export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");

    // No database means nothing has been analyzed. A canned diff here
    // would show the developer instrumentation that does not exist.
    const db = await getDbOrNull();
    if (!db) {
      return NextResponse.json(
        { error: "No analysis data available. Connect a repository and run an analysis first." },
        { status: 404 }
      );
    }

    const query: any = {};
    if (projectId) {
      // Ownership must be proven before a project id is trusted: without
      // this, any signed-in user could read another user's source code by
      // guessing an id.
      let project: any = null;
      try {
        project = await db
          .collection("projects")
          .findOne({ _id: new ObjectId(projectId), ownerId: userId });
      } catch {
        // Not a valid ObjectId — fall through to the string form.
      }
      if (!project) {
        project = await db.collection("projects").findOne({ _id: projectId as any, ownerId: userId });
      }
      if (!project) {
        return NextResponse.json({ error: "Project not found or unauthorized." }, { status: 404 });
      }
      query.projectId = projectId;
    } else {
      const projects = await db.collection("projects").find({ ownerId: userId }).toArray();
      const projectIds = projects.map((p) => p._id.toString());
      if (projectIds.length === 0) {
        return NextResponse.json({ error: "No projects connected." }, { status: 404 });
      }
      query.projectId = { $in: projectIds };
    }

    // Find the first component with recommendedEvent in this project to show a preview
    const component = await db.collection("components").findOne(
      { ...query, recommendedEvent: { $ne: null } }
    );

    if (!component) {
      return NextResponse.json({
        filePath: "No files instrumented yet",
        originalCode: "// Trigger sync & run analyzer to map components.",
        instrumentedCode: "// Trigger sync & run analyzer to map components.",
        diff: ""
      });
    }

    if (typeof component.codeSnippet !== "string" || !component.codeSnippet.trim() || typeof component.recommendedEvent !== "string") {
      return NextResponse.json({error:"No source snippet is available. Re-run analysis."},{status:404});
    }
    try {
      return NextResponse.json(createInstrumentationPreview(String(component.filePath ?? "preview.tsx"),component.codeSnippet,component.recommendedEvent));
    } catch (error) {
      return NextResponse.json({error:error instanceof Error ? error.message : "Could not preview instrumentation."},{status:422});
    }
  } catch (error: any) {
    console.error("Telemetry generator preview API error:", error);
    return NextResponse.json({ error: error.message || "Server Error" }, { status: 500 });
  }
}
