import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getDb } from "@/lib/mongodb";
import { generateProjectInsights } from "@/lib/insight-runner";

export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");


    const db = await getDb();

    // Fetch projects to scope queries
    const projects = await db.collection("projects").find({ ownerId: userId }).toArray();
    const projectIds = projects.map(p => p._id.toString());

    if (projectIds.length === 0) {
      return NextResponse.json([]);
    }

    let query: any = { projectId: { $in: projectIds } };
    if (projectId) {
      query = { projectId };
    }

    // Try fetching existing insights
    let insights = await db.collection("insights").find(query).toArray();

    // If empty and we have a specific project, trigger a quick generation run
    if (insights.length === 0 && projectId) {
      const newInsight = await generateProjectInsights(projectId);
      if (newInsight) {
        insights = [newInsight as any];
      }
    }

    const formatted = insights.map(ins => {
      // Setup dynamic glow highlights depending on insight type classification
      let color = "border-rose-500/30 text-rose-400 bg-rose-500/5 glow-rose";
      if (ins.type === "opportunity") {
        color = "border-indigo-500/30 text-indigo-400 bg-indigo-500/5 glow-indigo";
      } else if (ins.type === "positive") {
        color = "border-emerald-500/30 text-emerald-400 bg-emerald-500/5 glow-emerald";
      } else if (ins.type === "behavior") {
        color = "border-cyan-500/30 text-cyan-400 bg-cyan-500/5 glow-cyan";
      }

      let impact = "Low Impact";
      if (ins.type === "critical") impact = "High Impact";
      else if (ins.type === "opportunity") impact = "Medium Impact";

      return {
        type: ins.type,
        title: ins.title,
        description: ins.description,
        recommendation: ins.recommendation || "",
        color,
        impact,
        createdAt: ins.createdAt
      };
    });

    return NextResponse.json(formatted);
  } catch (error: any) {
    console.error("AI Insights API route error:", error);
    return NextResponse.json({ error: error.message || "Server Error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { projectId } = await req.json();
    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
    }

    const db = await getDb();
    const project = await db.collection("projects").findOne({ _id: projectId as any, ownerId: userId });
    if (!project) {
      return NextResponse.json({ error: "Project not found or unauthorized access." }, { status: 404 });
    }

    const insight = await generateProjectInsights(projectId);

    return NextResponse.json({
      success: true,
      insight,
      message: "AI Insights recalculated successfully."
    });
  } catch (error: any) {
    console.error("Trigger AI Insights API error:", error);
    return NextResponse.json({ error: error.message || "Server Error" }, { status: 500 });
  }
}
