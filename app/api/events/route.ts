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
    const category = searchParams.get("category");
    const search = searchParams.get("search");

    const hasMongo = !!process.env.MONGODB_URI;
    if (!hasMongo) {
      // Mock events fallback list
      return NextResponse.json([
        { name: "page_view", category: "Pageview", users: "8,642", occurrences: "12,653", lastSeen: "2m ago" },
        { name: "button_click", category: "Interaction", users: "5,910", occurrences: "7,842", lastSeen: "5m ago" },
        { name: "form_submit", category: "Form", users: "4,552", occurrences: "4,312", lastSeen: "12m ago" },
        { name: "sign_up", category: "Conversion", users: "5,910", occurrences: "5,910", lastSeen: "15m ago" },
        { name: "login", category: "Conversion", users: "4,552", occurrences: "4,552", lastSeen: "32m ago" },
        { name: "repository_connected", category: "Conversion", users: "2,184", occurrences: "2,184", lastSeen: "1h ago" },
        { name: "analysis_started", category: "System", users: "2,143", occurrences: "3,110", lastSeen: "2h ago" },
        { name: "analysis_completed", category: "System", users: "2,143", occurrences: "3,090", lastSeen: "2h ago" },
      ]);
    }

    const db = await getDb();

    // Fetch projects to scope queries
    const projects = await db.collection("projects").find({ ownerId: userId }).toArray();
    const projectIds = projects.map(p => p._id.toString());

    if (projectIds.length === 0) {
      return NextResponse.json([]);
    }

    // Build Match query
    const matchQuery: any = {
      projectId: { $in: projectIds }
    };

    if (category && category !== "All") {
      matchQuery.category = category;
    }

    if (search) {
      matchQuery.eventName = { $regex: search, $options: "i" };
    }

    // Aggregate by eventName to calculate unique users, occurrences, and max timestamp (last seen)
    const aggregated = await db.collection("events").aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: "$eventName",
          category: { $first: "$category" },
          occurrences: { $sum: 1 },
          usersList: { $addToSet: "$userId" },
          lastSeenDate: { $max: "$timestamp" }
        }
      },
      {
        $project: {
          name: "$_id",
          category: 1,
          occurrences: 1,
          usersCount: { $size: "$usersList" },
          lastSeenDate: 1
        }
      },
      { $sort: { occurrences: -1 } }
    ]).toArray();

    // Map into expected page items layout
    const formatted = aggregated.map(item => {
      // Calculate relative times (e.g. "2m ago")
      const diffMs = new Date().getTime() - new Date(item.lastSeenDate).getTime();
      const diffMins = Math.max(0, Math.floor(diffMs / (1000 * 60)));
      let lastSeen = "Just now";
      if (diffMins >= 60) {
        const hours = Math.floor(diffMins / 60);
        lastSeen = `${hours}h ago`;
      } else if (diffMins > 0) {
        lastSeen = `${diffMins}m ago`;
      }

      return {
        name: item.name,
        category: item.category || "Interaction",
        users: item.usersCount.toLocaleString(),
        occurrences: item.occurrences.toLocaleString(),
        lastSeen
      };
    });

    return NextResponse.json(formatted);
  } catch (error: any) {
    console.error("Events API route error:", error);
    return NextResponse.json({ error: error.message || "Server Error" }, { status: 500 });
  }
}
