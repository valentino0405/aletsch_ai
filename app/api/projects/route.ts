import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getDb } from "@/lib/mongodb";

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

    // Attempt MongoDB insertion if URI is present
    if (process.env.MONGODB_URI) {
      const db = await getDb();
      const projectDoc = {
        name,
        repositoryUrl,
        branch: branch || "main",
        ownerId: userId,
        status: "Connected",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = await db.collection("projects").insertOne(projectDoc);
      return NextResponse.json({
        success: true,
        id: result.insertedId.toString(),
        message: "Project connected successfully in MongoDB Atlas.",
      });
    }

    // Graceful fallback if MongoDB is not configured
    return NextResponse.json({
      success: true,
      id: "mock_" + Math.random().toString(36).substr(2, 9),
      message: "Project created in demo fallback mode (MONGODB_URI missing).",
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

    if (process.env.MONGODB_URI) {
      const db = await getDb();
      const projects = await db.collection("projects").find({ ownerId: userId }).toArray();
      return NextResponse.json(projects);
    }

    // Default mock project return if MongoDB is not configured
    return NextResponse.json([
      {
        _id: "demo_1",
        name: "TaskFlow Pro",
        repositoryUrl: "github.com/example/taskflow",
        branch: "main",
        ownerId: userId,
        status: "Connected",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);
  } catch (error: any) {
    console.error("API error:", error);
    return NextResponse.json({ error: error.message || "Server Error" }, { status: 500 });
  }
}
