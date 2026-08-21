import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getDb } from "@/lib/mongodb";

export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");


    const db = await getDb();

    // If projectId is provided, verify ownership of the project first
    let query: any = {};
    if (projectId) {
      const project = await db.collection("projects").findOne({ _id: projectId as any, ownerId: userId });
      if (!project) {
        // Double check ObjectId lookup
        try {
          const oProject = await db.collection("projects").findOne({ _id: new (require("mongodb").ObjectId)(projectId), ownerId: userId });
          if (!oProject) {
            return NextResponse.json({ error: "Project not found or unauthorized." }, { status: 404 });
          }
        } catch {
          return NextResponse.json({ error: "Project not found or unauthorized." }, { status: 404 });
        }
      }
      query.projectId = projectId;
    } else {
      // Default to returning components of all user's projects
      const projects = await db.collection("projects").find({ ownerId: userId }).toArray();
      const projectIds = projects.map(p => p._id.toString());
      if (projectIds.length === 0) {
        return NextResponse.json([]);
      }
      query.projectId = { $in: projectIds };
    }

    const components = await db.collection("components").find(query).toArray();

    const formatted = components.map(c => ({
      name: c.name || "Button",
      type: c.type || "CTA Button",
      status: "Instrumented",
      progress: "100%",
      events: c.recommendedEvent ? [c.recommendedEvent] : ["interacted"]
    }));

    return NextResponse.json(formatted);
  } catch (error: any) {
    console.error("Fetch instrumentation components error:", error);
    return NextResponse.json({ error: error.message || "Server Error" }, { status: 500 });
  }
}
