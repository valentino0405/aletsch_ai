import { getDb } from "./mongodb";
import { AIService } from "./ai/client";
import { SYSTEM_INSIGHTS_PROMPT, buildInsightsUserPrompt } from "./ai/prompts";
import { resolveFunnel } from "./analytics/funnel";

/**
 * Generates one grounded insight for a project.
 *
 * Everything the model sees is measured first: the funnel is derived
 * from events the project actually emitted, and the numbers come from
 * `computeFunnel`. If there is nothing to measure, no insight is
 * written — the UI shows "Insufficient data" rather than a plausible
 * sentence with a made-up percentage in it.
 */
export async function generateProjectInsights(projectId: string) {
  console.log(`Generating AI insights for project: ${projectId}`);
  const hasMongo = !!process.env.MONGODB_URI;
  if (!hasMongo) return null;

  try {
    const db = await getDb();

    // ── 1. Measure ───────────────────────────────────────────
    const uniqueUsers = await db.collection("events").distinct("userId", { projectId });
    const totalUsers = uniqueUsers.length;
    const eventCount = await db.collection("events").countDocuments({ projectId });

    const topEventRows = await db
      .collection("events")
      .aggregate([
        { $match: { projectId } },
        { $group: { _id: "$eventName", count: { $sum: { $ifNull: ["$occurrences", 1] } } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
      ])
      .toArray();

    const topEvents = topEventRows.map((row) => ({ name: row._id as string, count: row.count as number }));
    const funnel = await resolveFunnel(db, [projectId]);

    // ── 2. Refuse to speak without evidence ──────────────────
    // One event from one user is not a behavioural pattern. Saying so
    // is more useful than a confident-sounding guess.
    if (eventCount === 0 || !funnel || funnel.insufficientData) {
      const doc = {
        projectId,
        type: "behavior",
        title: "Insufficient data to determine this",
        description:
          eventCount === 0
            ? "No events have been received for this project yet, so there is nothing to analyse. Apply an instrumentation plan and collect traffic first."
            : `Only ${eventCount} event${eventCount === 1 ? "" : "s"} from ${totalUsers} user${totalUsers === 1 ? "" : "s"} have been received, which is not enough to identify a drop-off.`,
        recommendation:
          "Collect more traffic, then regenerate insights. Aletsch will not estimate conversion rates from data it does not have.",
        grounding: { eventCount, totalUsers, funnelAvailable: !!funnel },
        createdAt: new Date().toISOString(),
      };

      await db.collection("insights").deleteMany({ projectId });
      await db.collection("insights").insertOne(doc);
      return doc;
    }

    // ── 3. Ground the model in the measurements ──────────────
    const statsContext = {
      funnelName: funnel.funnelName,
      funnelSource: funnel.source,
      totalUsers,
      totalEvents: eventCount,
      conversionRate: funnel.conversionRate === null ? null : `${funnel.conversionRate.toFixed(1)}%`,
      steps: funnel.steps.map((step) => ({
        name: step.name,
        event: step.event,
        users: step.users,
        percentOfEntry: step.percent,
        dropFromPrevious: step.dropFromPrevious,
      })),
      largestDropoff: funnel.largestDropoff
        ? {
            from: funnel.largestDropoff.from,
            to: funnel.largestDropoff.to,
            rate: `${funnel.largestDropoff.rate.toFixed(1)}%`,
          }
        : null,
      topEvents,
    };

    let insightResult: any = null;
    // Whether a model actually wrote this insight. `insightResult` is
    // always truthy further down (the deterministic branch fills it in),
    // so it cannot answer that question on its own — reading it as
    // provenance labelled rule-based text as AI-generated.
    let aiAuthored = false;

    if (AIService.isConfigured()) {
      insightResult = await AIService.generateStructured(
        SYSTEM_INSIGHTS_PROMPT,
        buildInsightsUserPrompt(statsContext),
        (parsed) => {
          if (!parsed.type || !parsed.title || !parsed.description) return null;
          return {
            type: parsed.type,
            title: parsed.title,
            description: parsed.description,
            recommendation: parsed.recommendation || "",
          };
        }
      );
      aiAuthored = !!insightResult;
    }

    // ── 4. Deterministic fallback, still from real numbers ───
    // Used when no model is configured or the call failed. It restates
    // the measured funnel; it never introduces a figure of its own.
    if (!insightResult) {
      // Distinguish "no key" from "the key is set but the call failed" —
      // they need different fixes, and the earlier wording blamed the
      // former for what was almost always the latter.
      const aiNote = AIService.isConfigured()
        ? "The configured AI model did not return a usable response, so this is a direct restatement of the measured funnel. Check the server log for the OpenRouter error."
        : "No AI model is configured, so this is a direct restatement of the measured funnel rather than a diagnosis.";
      const worst = funnel.largestDropoff;
      insightResult = worst
        ? {
            type: worst.rate >= 25 ? "critical" : "opportunity",
            title: `${worst.rate.toFixed(1)}% drop-off between ${worst.from} and ${worst.to}`,
            description: `Of the ${funnel.totalUsers} user${funnel.totalUsers === 1 ? "" : "s"} who reached ${funnel.steps[0].name}, ${worst.rate.toFixed(1)}% did not continue from ${worst.from} to ${worst.to}. End-to-end conversion through "${funnel.funnelName}" is ${funnel.conversionRate?.toFixed(1)}%.`,
            recommendation: `Inspect the journey between ${worst.from} and ${worst.to}. ${aiNote}`,
          }
        : {
            type: "behavior",
            title: `${funnel.conversionRate?.toFixed(1)}% complete "${funnel.funnelName}"`,
            description: `${funnel.totalUsers} user${funnel.totalUsers === 1 ? "" : "s"} entered the funnel and ${funnel.steps[funnel.steps.length - 1].users} reached the final step. No single step loses a disproportionate share.`,
            recommendation: `No significant drop-off was measured. ${aiNote}`,
          };
    }

    const insightDoc = {
      projectId,
      type: insightResult.type,
      title: insightResult.title,
      description: insightResult.description,
      recommendation: insightResult.recommendation,
      // The exact figures the insight was generated from, so a reader
      // can check the claim against the data.
      grounding: {
        funnelName: funnel.funnelName,
        funnelSource: funnel.source,
        conversionRate: funnel.conversionRate,
        largestDropoff: funnel.largestDropoff,
        totalUsers,
        totalEvents: eventCount,
        aiGenerated: aiAuthored,
      },
      createdAt: new Date().toISOString(),
    };

    await db.collection("insights").deleteMany({ projectId });
    await db.collection("insights").insertOne(insightDoc);

    // Raise an alert only for a drop-off that was actually measured.
    if (insightDoc.type === "critical" && funnel.largestDropoff) {
      await db.collection("alerts").insertOne({
        projectId,
        title: insightDoc.title,
        description: insightDoc.description,
        severity: "Critical",
        category: "Funnel Analysis",
        createdAt: new Date().toISOString(),
      });
    }

    return insightDoc;
  } catch (error) {
    console.error("AI Insight runner failed:", error);
    return null;
  }
}
