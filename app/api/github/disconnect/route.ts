import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { deleteConnection } from "@/lib/github-connection";

/**
 * POST /api/github/disconnect
 * Deletes the stored (encrypted) GitHub token for this user. Existing
 * analyses are kept; further repository reads fall back to the
 * server-wide public-only credential.
 */
export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const removed = await deleteConnection(userId);
    return NextResponse.json({
      success: true,
      removed,
      message: removed
        ? "GitHub account disconnected. The stored access token has been deleted."
        : "No GitHub connection was stored for this account.",
    });
  } catch (error: any) {
    console.error("[GitHub disconnect] failed:", error?.message);
    return NextResponse.json({ error: "Could not disconnect GitHub." }, { status: 500 });
  }
}
