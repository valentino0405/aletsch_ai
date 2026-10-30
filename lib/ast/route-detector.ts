// ============================================================
// Aletsch AI — Route Detector
// Converts file paths to logical Next.js routes
// ============================================================

/**
 * Converts a source file path to a logical Next.js route.
 *
 * Examples:
 *   app/page.tsx                     → /
 *   app/dashboard/page.tsx           → /dashboard
 *   app/(auth)/login/page.tsx        → /login
 *   app/projects/[id]/page.tsx       → /projects/[id]
 *   pages/index.tsx                  → /
 *   pages/dashboard.tsx              → /dashboard
 *   pages/users/[id].tsx             → /users/[id]
 *   src/app/dashboard/page.tsx       → /dashboard
 *   src/pages/login.tsx              → /login
 *   components/Navbar.tsx            → (component)
 */
export function detectRouteFromPath(filePath: string): string {
  // Normalize path separators
  const normalized = filePath.replace(/\\/g, "/");

  // Strip leading src/ if present
  const stripped = normalized.replace(/^src\//, "");

  // --- App Router ---
  if (stripped.startsWith("app/")) {
    if (!/(^|\/)(page|layout|loading|error|not-found|template)\.(tsx|ts|jsx|js)$/.test(stripped)) return "(component)";
    let route = stripped.replace(/^app\//, "");

    // Remove file name (page.tsx, layout.tsx, loading.tsx, etc.)
    route = route.replace(/\/(page|layout|loading|error|not-found|template)\.(tsx|ts|jsx|js)$/, "");

    // Root-level page.tsx → /
    if (route === "page.tsx" || route === "page.ts" || route === "page.jsx" || route === "page.js") {
      return "/";
    }

    // Remove Next.js route groups like (auth), (marketing)
    const segments: string[] = [];
    for (let segment of route.split("/")) {
      if (!segment || segment.startsWith("@") || /^\([^)]+\)$/.test(segment) || segment.startsWith("_")) continue;
      if (segment.startsWith("(...)")) { segments.length = 0; segment = segment.slice(5); }
      while (segment.startsWith("(..)")) { segments.pop(); segment = segment.slice(4); }
      if (segment.startsWith("(.)")) segment = segment.slice(3);
      if (segment) segments.push(segment);
    }
    route = segments.join("/");

    // Clean trailing slash from empty groups
    route = route.replace(/\/$/, "");

    return route ? `/${route}` : "/";
  }

  // --- Pages Router ---
  if (stripped.startsWith("pages/")) {
    let route = stripped.replace(/^pages\//, "");

    // Remove extension
    route = route.replace(/\.(tsx|ts|jsx|js)$/, "");

    // index → /
    if (route === "index") return "/";

    // _app and _document are not real routes
    if (route.startsWith("_") || route.startsWith("api/")) return "(internal)";
    route = route.replace(/\/index$/, "");

    return `/${route}`;
  }

  // For component files, indicate not a route page
  return "(component)";
}

/**
 * Determines if a file path represents a Next.js page (App or Pages Router).
 */
export function isPageFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/").replace(/^src\//, "");
  // App Router
  if (normalized.match(/app\/.*\/(page|layout)\.(tsx|ts|jsx|js)$/)) return true;
  if (normalized.match(/^app\/(page|layout)\.(tsx|ts|jsx|js)$/)) return true;
  // Pages Router
  if (/^pages\/(?!api\/)(?!_).*\.(tsx|ts|jsx|js)$/.test(normalized)) return true;
  return false;
}

/**
 * Returns all unique routes from a list of file paths.
 */
export function extractRoutes(filePaths: string[]): string[] {
  const routes = new Set<string>();
  for (const fp of filePaths) {
    if (isPageFile(fp)) {
      const route = detectRouteFromPath(fp);
      if (route && route !== "(component)" && route !== "(internal)") {
        routes.add(route);
      }
    }
  }
  return Array.from(routes).sort();
}
