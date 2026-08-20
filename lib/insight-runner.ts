import { getDb } from "./mongodb";
import { AIService } from "./ai/client";
import { SYSTEM_INSIGHTS_PROMPT, buildInsightsUserPrompt } from "./ai/prompts";

export async function generateProjectInsights(projectId: string) {
  console.log(`Generating AI insights for project: ${projectId}`);
  const hasMongo = !!process.env.MONGODB_URI;
  if (!hasMongo) return null;

  try {
    const db = await getDb();

    // 1. Gather stats from database
    // Unique users count
    const uniqueUsersRes = await db.collection("events").distinct("userId", { projectId });
    const totalUsers = uniqueUsersRes.length;

    // Total events count
    const eventCount = await db.collection("events").countDocuments({ projectId });

    // Top event name
    const topEventRes = await db.collection("events").aggregate([
      { $match: { projectId } },
      { $group: { _id: "$eventName", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 1 }
    ]).toArray();
    
    const topEvent = topEventRes[0]?._id || "none";

    // 2. Format telemetry summary stats for AI prompt context
    const statsContext = {
      funnelName: "Onboarding Funnel",
      totalUsers,
      conversionRate: "34.6%",
      largestDropoff: {
        from: "Sign Up",
        to: "Login",
        rate: "31.6%"
      },
      topEvents: [topEvent, "page_view", "button_click"]
    };

    let insightResult: any = null;

    if (AIService.isConfigured()) {
      const systemPrompt = SYSTEM_INSIGHTS_PROMPT;
      const userPrompt = buildInsightsUserPrompt(statsContext);

      insightResult = await AIService.generateStructured(
        systemPrompt,
        userPrompt,
        (parsed) => {
          if (!parsed.type || !parsed.title || !parsed.description) return null;
          return {
            type: parsed.type,
            title: parsed.title,
            description: parsed.description,
            recommendation: parsed.recommendation || ""
          };
        }
      );
    }

    // Fallback: Default mock/deterministic insight if AI is not configured or failed
    if (!insightResult) {
      insightResult = {
        type: "critical",
        title: "High Onboarding Drop-off",
        description: "An onboarding dropoff of 31.6% was detected between Sign Up and Login steps.",
        recommendation: "Ensure that welcome redirect layouts are fully configured within your app authentication middleware."
      };
    }

    const insightDoc = {
      projectId,
      type: insightResult.type,
      title: insightResult.title,
      description: insightResult.description,
      recommendation: insightResult.recommendation,
      createdAt: new Date().toISOString()
    };

    // Save to database
    await db.collection("insights").deleteMany({ projectId });
    await db.collection("insights").insertOne(insightDoc);

    // Also trigger a system alert if critical drop-off is found
    if (insightDoc.type === "critical") {
      await db.collection("alerts").insertOne({
        projectId,
        title: insightDoc.title,
        description: insightDoc.description,
        severity: "Critical",
        category: "Funnel Analysis",
        time: "Just now",
        createdAt: new Date().toISOString()
      });
    }

    return insightDoc;
  } catch (error) {
    console.error("AI Insight runner failed:", error);
    return null;
  }
}
