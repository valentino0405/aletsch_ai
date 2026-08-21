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
    const funnelType = searchParams.get("type") || "Onboarding Funnel";


    const db = await getDb();

    // Fetch projects to scope queries
    const projects = await db.collection("projects").find({ ownerId: userId }).toArray();
    const projectIds = projects.map(p => p._id.toString());

    if (projectIds.length === 0) {
      return NextResponse.json({
        funnelName: funnelType,
        steps: [],
        largestDropoff: null
      });
    }

    // Define step mappings
    let stepsDef = [
      { name: "Landing Page", event: "page_view" },
      { name: "Sign Up", event: "sign_up" },
      { name: "Login", event: "login" },
      { name: "Create Task", event: "task_created" },
      { name: "Task Completed", event: "task_completed" }
    ];

    if (funnelType === "Checkout Pipeline") {
      stepsDef = [
        { name: "Cart Viewed", event: "cart_viewed" },
        { name: "Checkout Started", event: "checkout_started" },
        { name: "Shipping Added", event: "shipping_added" },
        { name: "Payment Complete", event: "payment_complete" }
      ];
    }

    // Calculate unique users at each step
    const stepsData = [];
    let prevUsers = 0;
    let baseUsers = 0;

    for (let i = 0; i < stepsDef.length; i++) {
      const step = stepsDef[i];
      const uniqueUsers = await db.collection("events").distinct("userId", {
        projectId: { $in: projectIds },
        eventName: step.event
      });
      const count = uniqueUsers.length;

      if (i === 0) {
        baseUsers = count;
      }

      const percent = baseUsers > 0 ? Math.round((count / baseUsers) * 1000) / 10 : 0;
      const drop = i > 0 && prevUsers > 0 ? Math.round(((prevUsers - count) / baseUsers) * 1000) / 10 : 0;

      stepsData.push({
        name: step.name,
        users: count,
        percent,
        drop: i > 0 ? drop : 0
      });

      prevUsers = count;
    }

    // Find largest dropoff
    let maxDropRate = -1;
    let largestDropoff = null;
    for (let i = 1; i < stepsData.length; i++) {
      const step = stepsData[i];
      if (step.drop > maxDropRate) {
        maxDropRate = step.drop;
        largestDropoff = {
          from: stepsData[i - 1].name,
          to: step.name,
          rate: `${step.drop}%`
        };
      }
    }

    // Fallback default values if there are no real events loaded yet
    if (baseUsers === 0) {
      return NextResponse.json({
        funnelName: funnelType,
        steps: stepsDef.map((s, idx) => ({
          name: s.name,
          users: idx === 0 ? 1 : 0,
          percent: idx === 0 ? 100 : 0,
          drop: idx === 0 ? 0 : 100
        })),
        largestDropoff: { from: stepsDef[0].name, to: stepsDef[1].name, rate: "100%" }
      });
    }

    return NextResponse.json({
      funnelName: funnelType,
      steps: stepsData,
      largestDropoff
    });
  } catch (error: any) {
    console.error("Funnels API route error:", error);
    return NextResponse.json({ error: error.message || "Server Error" }, { status: 500 });
  }
}
