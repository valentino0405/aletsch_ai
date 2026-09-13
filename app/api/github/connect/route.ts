import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  buildAuthorizeUrl,
  buildRedirectUri,
  createOAuthState,
  describeOAuthUnavailability,
  isGitHubOAuthConfigured,
} from "@/lib/github-connection";

/**
 * GET /api/github/connect
 * Starts the GitHub OAuth Web Application Flow. The user is redirected
 * to github.com to grant access; Aletsch never sees their credentials.
 */
export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isGitHubOAuthConfigured()) {
    return NextResponse.json(
      {
        error: describeOAuthUnavailability(),
        code: "oauth_not_configured",
        help: "Create a GitHub OAuth App, then set GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET and TOKEN_ENCRYPTION_KEY. See .env.example.",
      },
      { status: 503 }
    );
  }

  const url = new URL(req.url);
  const returnTo = url.searchParams.get("returnTo") || "/repositories";
  // Only same-origin relative paths are accepted, so the callback
  // cannot be used as an open redirect.
  const safeReturnTo = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/repositories";

  try {
    const redirectUri = buildRedirectUri(req.url);
    const state = await createOAuthState(userId, safeReturnTo);
    return NextResponse.redirect(buildAuthorizeUrl(state, redirectUri));
  } catch (error: any) {
    console.error("[GitHub connect] failed to start OAuth:", error?.message);
    return NextResponse.json({ error: "Could not start GitHub authorisation." }, { status: 500 });
  }
}
