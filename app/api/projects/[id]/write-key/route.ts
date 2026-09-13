// ============================================================
// Aletsch AI — Project write key
// ------------------------------------------------------------
// GET  /api/projects/[id]/write-key  — read the current key
// POST /api/projects/[id]/write-key  — mint a new one (rotate)
//
// The write key is publishable: it only permits appending events to
// one project. It is still scoped to the project owner here, because
// handing it to another account would let them attribute traffic to a
// project that is not theirs.
//
// This is the only endpoint that returns a key. GitHub access tokens
// are never returned by any endpoint, in any form.
// ============================================================

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ObjectId } from "mongodb";
import { getDbOrNull } from "@/lib/mongodb";
import { fallbackStore } from "@/lib/fallback-store";
import { generateProjectWriteKey } from "@/lib/security/token-crypto";

async function findOwnedProject(db: any, projectId: string, userId: string) {
  try {
    const found = await db
      .collection("projects")
      .findOne({ _id: new ObjectId(projectId), ownerId: userId });
    if (found) return found;
  } catch {
    // Not a valid ObjectId — fall through to the string form.
  }
  return db.collection("projects").findOne({ _id: projectId as any, ownerId: userId });
}

function ingestOrigin(req: Request): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") ||
    new URL(req.url).origin
  );
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const db = await getDbOrNull();

    if (!db) {
      const project = fallbackStore.getProject(id, userId);
      if (!project) {
        return NextResponse.json({ error: "Project not found." }, { status: 404 });
      }
      if (!project.writeKey) {
        project.writeKey = generateProjectWriteKey();
      }
      return NextResponse.json({
        writeKey: project.writeKey,
        ingestUrl: `${ingestOrigin(req)}/api/ingest`,
        storage: "in-memory",
      });
    }

    const project = await findOwnedProject(db, id, userId);
    if (!project) {
      return NextResponse.json({ error: "Project not found or unauthorized." }, { status: 404 });
    }

    // Projects created before keys were enforced have none. Mint one on
    // read rather than leaving the developer with a broken tracker.
    let writeKey = project.writeKey;
    if (!writeKey) {
      writeKey = generateProjectWriteKey();
      await db
        .collection("projects")
        .updateOne({ _id: project._id }, { $set: { writeKey, updatedAt: new Date().toISOString() } });
    }

    return NextResponse.json({
      writeKey,
      ingestUrl: `${ingestOrigin(req)}/api/ingest`,
      envVarName: "NEXT_PUBLIC_ALETSCH_WRITE_KEY",
    });
  } catch (error: any) {
    console.error("[Write key] GET failed:", error?.message || error);
    return NextResponse.json({ error: "Could not read the write key." }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const writeKey = generateProjectWriteKey();
    const db = await getDbOrNull();

    if (!db) {
      const project = fallbackStore.getProject(id, userId);
      if (!project) {
        return NextResponse.json({ error: "Project not found." }, { status: 404 });
      }
      project.writeKey = writeKey;
      return NextResponse.json({ success: true, writeKey, storage: "in-memory" });
    }

    const project = await findOwnedProject(db, id, userId);
    if (!project) {
      return NextResponse.json({ error: "Project not found or unauthorized." }, { status: 404 });
    }

    await db
      .collection("projects")
      .updateOne({ _id: project._id }, { $set: { writeKey, updatedAt: new Date().toISOString() } });

    return NextResponse.json({
      success: true,
      writeKey,
      // Rotation is not free: already-deployed bundles carry the old key.
      warning:
        "The previous key stops working immediately. Update ALETSCH_WRITE_KEY in your app and redeploy, or events will be rejected.",
    });
  } catch (error: any) {
    console.error("[Write key] POST failed:", error?.message || error);
    return NextResponse.json({ error: "Could not rotate the write key." }, { status: 500 });
  }
}
