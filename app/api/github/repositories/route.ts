import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { listUserRepositories, GitHubApiError } from "@/lib/github";
import { getConnectionStatus, resolveGitHubAuth } from "@/lib/github-connection";

/**
 * GET /api/github/repositories
 * Lists every repository the signed-in user's GitHub authorisation can
 * see — public and private — so they can pick one instead of pasting a
 * URL. Requires a connected GitHub account: the server-wide PAT is not
 * used here, because listing *someone else's* repositories from it
 * would be wrong.
 */
export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const status = await getConnectionStatus(userId);
  if (!status.connected) {
    return NextResponse.json(
      {
        error: "GitHub account is not connected.",
        code: "not_connected",
        oauthAvailable: status.oauthAvailable,
        unavailableReason: status.unavailableReason,
      },
      { status: 409 }
    );
  }

  const url = new URL(req.url);
  const search = (url.searchParams.get("search") || "").toLowerCase().trim();
  const visibility = url.searchParams.get("visibility"); // "public" | "private" | null

  try {
    const githubAuth = await resolveGitHubAuth(userId);
    let repos = await listUserRepositories(githubAuth);

    if (visibility === "public") repos = repos.filter((r) => !r.isPrivate);
    if (visibility === "private") repos = repos.filter((r) => r.isPrivate);
    if (search) {
      repos = repos.filter(
        (r) =>
          r.fullName.toLowerCase().includes(search) ||
          (r.description || "").toLowerCase().includes(search)
      );
    }

    return NextResponse.json({
      connectedAs: status.githubLogin,
      total: repos.length,
      repositories: repos.map((r) => ({
        fullName: r.fullName,
        name: r.name,
        owner: r.owner,
        url: r.htmlUrl,
        defaultBranch: r.defaultBranch,
        description: r.description,
        language: r.language,
        stars: r.stars,
        isPrivate: r.isPrivate,
        pushedAt: r.pushedAt,
        canPush: r.permissions.push,
      })),
    });
  } catch (error: any) {
    if (error instanceof GitHubApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status === 0 ? 502 : error.status });
    }
    console.error("[GitHub repositories] failed:", error?.message);
    return NextResponse.json({ error: "Could not list GitHub repositories." }, { status: 500 });
  }
}
