import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getDb } from "@/lib/mongodb";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const hasMongo = !!process.env.MONGODB_URI;
    if (!hasMongo) {
      // Mock alerts fallback list
      return NextResponse.json([
        {
          id: "1",
          title: "High drop-off detected",
          description: "Onboarding funnel conversion dropped by 12% between Sign Up and Login steps.",
          severity: "Critical",
          category: "Funnel Analysis",
          time: "32m ago",
          colorClass: "border-rose-500/30 bg-rose-500/5 text-rose-400 glow-rose",
        },
        {
          id: "2",
          title: "Event volume spike",
          description: "Event 'repository_connected' triggered 4x more frequently than typical hourly average.",
          severity: "Warning",
          category: "Telemetry Engine",
          time: "1h ago",
          colorClass: "border-amber-500/30 bg-amber-500/5 text-amber-400 glow-amber",
        },
        {
          id: "3",
          title: "Instrumentation issues",
          description: "Code injection handler failed in Checkout.tsx on layout render hooks.",
          severity: "Warning",
          category: "Telemetry Engine",
          time: "3h ago",
          colorClass: "border-amber-500/30 bg-amber-500/5 text-amber-400 glow-amber",
        },
      ]);
    }

    const db = await getDb();

    // Fetch projects to scope queries
    const projects = await db.collection("projects").find({ ownerId: userId }).toArray();
    const projectIds = projects.map(p => p._id.toString());

    if (projectIds.length === 0) {
      return NextResponse.json([]);
    }

    const alerts = await db.collection("alerts")
      .find({ projectId: { $in: projectIds } })
      .sort({ createdAt: -1 })
      .limit(10)
      .toArray();

    const formatted = alerts.map(a => {
      // Color coding style based on severity
      const colorClass = a.severity === "Critical" 
        ? "border-rose-500/30 bg-rose-500/5 text-rose-400 glow-rose"
        : "border-amber-500/30 bg-amber-500/5 text-amber-400 glow-amber";

      return {
        id: a._id.toString(),
        title: a.title,
        description: a.description,
        severity: a.severity,
        category: a.category || "General",
        time: a.time || "Just now",
        colorClass
      };
    });

    return NextResponse.json(formatted);
  } catch (error: any) {
    console.error("Alerts API route error:", error);
    return NextResponse.json({ error: error.message || "Server Error" }, { status: 500 });
  }
}
