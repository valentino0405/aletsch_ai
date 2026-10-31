// ============================================================
// Aletsch AI — Edge Proxy (Next.js 16 replaces middleware.ts)
// Enforces Clerk authentication on every private route; the public
// dashboard preview uses only fictional, local sample data.
// ============================================================

import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/**
 * Routes that must stay reachable without a Clerk session.
 *
 * `/api/ingest` is intentionally public: it is the telemetry write
 * endpoint called from the *instrumented customer application*, which
 * has no Clerk session. It is authorised separately by a per-project
 * write key (see app/api/ingest/route.ts).
 */
const isPublicRoute = createRouteMatcher([
  "/",
  "/dashboard-preview(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/ingest",
  "/api/health",
]);

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return;

  const session = await auth();
  if (session.userId) return;

  // API callers get a machine-readable 401 instead of an HTML redirect.
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return session.redirectToSignIn();
});

export const config = {
  matcher: [
    // Everything except Next internals and files with an extension.
    "/((?!_next|.*\\.[\\w]+$).*)",
    "/api/(.*)",
  ],
};
