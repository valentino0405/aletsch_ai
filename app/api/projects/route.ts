import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getDbOrNull } from "@/lib/mongodb";
import { fallbackStore } from "@/lib/fallback-store";
import { generateProjectWriteKey } from "@/lib/security/token-crypto";

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { name, repositoryUrl, branch } = await req.json();
    if (!name || !repositoryUrl) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const db = await getDbOrNull();
    if (db) {
      const projectDoc = {
        name,
        repositoryUrl,
        branch: branch || "main",
        ownerId: userId,
        status: "Connected",
        // Publishable key the generated tracker uses to authorise
        // POST /api/ingest. Minted at creation so instrumentation can
        // be applied without a separate setup step.
        writeKey: generateProjectWriteKey(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = await db.collection("projects").insertOne(projectDoc);
      return NextResponse.json({
        success: true,
        id: result.insertedId.toString(),
        writeKey: projectDoc.writeKey,
        message: "Project connected successfully in MongoDB Atlas.",
      });
    }

    const fallbackProject = fallbackStore.saveProject({
      id: "fb_proj_" + Math.random().toString(36).substring(2, 9),
      ownerId: userId,
      name,
      repositoryUrl,
      branch: branch || "main",
      language: "TypeScript",
      status: "Connected",
      events: 0,
      lastAnalyzed: "Just created",
      writeKey: generateProjectWriteKey(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      id: fallbackProject.id,
      writeKey: fallbackProject.writeKey,
      message: "Project created successfully.",
    });
  } catch (error: any) {
    console.error("API error:", error);
    return NextResponse.json({ error: error.message || "Server Error" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = await getDbOrNull();
    if (db) {
      const projects = await db.collection("projects").find({ ownerId: userId }).toArray();
      return NextResponse.json(projects);
    }

    const fbProjects = fallbackStore.getProjects(userId);
    return NextResponse.json(
      fbProjects.map((p) => ({
        _id: p.id,
        name: p.name,
        repositoryUrl: p.repositoryUrl,
        branch: p.branch,
        ownerId: p.ownerId,
        status: p.status,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      }))
    );
  } catch (error: any) {
    console.error("API error:", error);
    return NextResponse.json({ error: error.message || "Server Error" }, { status: 500 });
  }
}

