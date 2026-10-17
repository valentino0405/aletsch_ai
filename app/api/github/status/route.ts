import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getConnectionStatus } from "@/lib/github-connection";

/**
 * GET /api/github/status
 * Reports whether the signed-in user has connected GitHub, and which
 * credential mode repository reads currently use. Returns no token.
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    return NextResponse.json(await getConnectionStatus(userId));
  } catch (error: any) {
    console.error("[GitHub status] failed:", error?.message);
    return NextResponse.json({ error: "Could not read GitHub connection status." }, { status: 500 });
  }
}
