import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getDb } from "@/lib/mongodb";
import { parseGitHubUrl, getRepoMetadata, getRepoBranches } from "@/lib/github";

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { repositoryUrl } = await req.json();
    if (!repositoryUrl) {
      return NextResponse.json({ error: "Missing repositoryUrl parameter." }, { status: 400 });
    }

    // 1. Validate & Parse URL
    let parsed;
    try {
      parsed = parseGitHubUrl(repositoryUrl);
    } catch (e: any) {
      return NextResponse.json({ error: e.message || "Invalid repository URL format" }, { status: 400 });
    }

    // 2. Fetch metadata from GitHub API
    let meta;
    try {
      meta = await getRepoMetadata(parsed.owner, parsed.repo);
    } catch (e: any) {
      return NextResponse.json({ error: `GitHub communication failed: ${e.message}` }, { status: 400 });
    }

    // 3. Fetch list of branches
    let branches: string[] = ["main"];
    try {
      branches = await getRepoBranches(parsed.owner, parsed.repo);
    } catch (e) {
      console.warn("Could not load branches, default to main", e);
    }

    // 4. Save repository state to MongoDB (if configured)
    if (process.env.MONGODB_URI) {
      const db = await getDb();
      const repoDoc = {
        ownerId: userId,
        url: repositoryUrl,
        owner: meta.owner,
        name: meta.name,
        defaultBranch: meta.defaultBranch,
        stars: meta.stars,
        forks: meta.forks,
        language: meta.language,
        branches,
        lastSyncedAt: new Date().toISOString(),
        status: "Synced"
      };

      const result = await db.collection("repositories").replaceOne(
        { url: repositoryUrl, ownerId: userId },
        repoDoc,
        { upsert: true }
      );

      return NextResponse.json({
        success: true,
        meta,
        branches,
        message: "Repository synchronized successfully inside database."
      });
    }

    // Mock response fallback
    return NextResponse.json({
      success: true,
      meta,
      branches,
      message: "Repository validated in fallback environment."
    });
  } catch (error: any) {
    console.error("Repository API error:", error);
    return NextResponse.json({ error: error.message || "Server Error" }, { status: 500 });
  }
}
