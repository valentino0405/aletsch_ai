import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  buildRedirectUri,
  consumeOAuthState,
  exchangeCodeForToken,
  isGitHubOAuthConfigured,
  saveConnection,
} from "@/lib/github-connection";

/** Builds an absolute redirect back into the app with a status flag. */
function backTo(req: Request, path: string, params: Record<string, string>) {
  const target = new URL(path, new URL(req.url).origin);
  for (const [key, value] of Object.entries(params)) target.searchParams.set(key, value);
  return NextResponse.redirect(target);
}

/**
 * GET /api/github/callback
 * OAuth redirect target. Verifies the CSRF state, exchanges the code
 * for an access token server-side, seals it, and returns the user to
 * the page they started from.
 */
export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    return backTo(req, "/repositories", {
      github: "error",
      reason: url.searchParams.get("error_description") || oauthError,
    });
  }
  if (!isGitHubOAuthConfigured()) {
    return backTo(req, "/repositories", { github: "error", reason: "GitHub OAuth is not configured on this server." });
  }
  if (!code || !state) {
    return backTo(req, "/repositories", { github: "error", reason: "Authorisation response was incomplete." });
  }

  const stateRecord = await consumeOAuthState(state, userId);
  if (!stateRecord) {
    return backTo(req, "/repositories", {
      github: "error",
      reason: "Authorisation state was invalid or expired. Please try connecting again.",
    });
  }

  try {
    const redirectUri = buildRedirectUri(req.url);
    const { accessToken, scopes } = await exchangeCodeForToken(code, redirectUri);
    const connection = await saveConnection(userId, accessToken, scopes);

    return backTo(req, stateRecord.returnTo, {
      github: "connected",
      login: connection.githubLogin ?? "",
    });
  } catch (error: any) {
    // error.message is GitHub- or Aletsch-authored and carries no token.
    console.error("[GitHub callback] authorisation failed:", error?.message);
    return backTo(req, stateRecord.returnTo, {
      github: "error",
      reason: error?.message || "GitHub authorisation failed.",
    });
  }
}
