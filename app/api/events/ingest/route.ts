import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { ObjectId } from "mongodb";

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    const {
      projectId,
      eventName,
      category,
      path,
      timestamp,
      userId,
      anonymousId,
      sessionId,
      properties
    } = payload;

    // 1. Validation
    if (!projectId || !eventName) {
      return NextResponse.json({ error: "Missing projectId or eventName." }, { status: 400 });
    }

    const hasMongo = !!process.env.MONGODB_URI;
    if (!hasMongo) {
      return NextResponse.json({ success: true, message: "Event ingested in mock mode." });
    }

    const db = await getDb();

    // Verify project exists
    let projectObjectId;
    try {
      projectObjectId = new ObjectId(projectId);
    } catch {
      // Allow string IDs
    }

    const projectQuery = projectObjectId ? { _id: projectObjectId } : { _id: projectId as any };
    const project = await db.collection("projects").findOne(projectQuery);

    if (!project) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    const eventTime = timestamp ? new Date(timestamp).toISOString() : new Date().toISOString();
    const cleanUserId = userId || anonymousId || "anonymous";
    const cleanSessionId = sessionId || "session_default";

    // 2. Insert Event
    const eventDoc = {
      projectId,
      eventName,
      category: category || "Interaction",
      path: path || "/",
      userId: cleanUserId,
      anonymousId: anonymousId || "",
      sessionId: cleanSessionId,
      properties: properties || {},
      timestamp: eventTime,
      occurrences: 1,
      lastSeen: eventTime,
      createdAt: new Date().toISOString()
    };

    await db.collection("events").insertOne(eventDoc);

    // 3. Dynamic Session Tracking
    const startedAt = eventTime;
    const lastActivityAt = eventTime;

    const sessionQuery = { sessionId: cleanSessionId, projectId };
    const existingSession = await db.collection("sessions").findOne(sessionQuery);

    if (existingSession) {
      // Update session activity
      await db.collection("sessions").updateOne(
        sessionQuery,
        {
          $set: { lastActivityAt, exitPath: path || "/" },
          $inc: { eventCount: 1 }
        }
      );
    } else {
      // Insert new session
      const sessionDoc = {
        sessionId: cleanSessionId,
        projectId,
        userId: cleanUserId,
        anonymousId: anonymousId || "",
        startedAt,
        lastActivityAt,
        eventCount: 1,
        entryPath: path || "/",
        exitPath: path || "/",
        createdAt: new Date().toISOString()
      };
      await db.collection("sessions").insertOne(sessionDoc);
    }

    return NextResponse.json({ success: true, message: "Event and session telemetry ingested." });
  } catch (error: any) {
    console.error("Event ingestion failure:", error);
    return NextResponse.json({ error: error.message || "Server Error" }, { status: 500 });
  }
}
