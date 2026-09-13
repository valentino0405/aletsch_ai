import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getDbOrNull } from "@/lib/mongodb";

export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");
    const search = searchParams.get("search");

    // No database means no events have been recorded. An invented
    // catalog here would be indistinguishable from a real one in the UI.
    const db = await getDbOrNull();
    if (!db) {
      return NextResponse.json([]);
    }

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
      // Escaped: an unescaped user string is a regex-injection vector and
      // a trivial way to make the database do unbounded backtracking.
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      matchQuery.eventName = { $regex: escaped, $options: "i" };
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
