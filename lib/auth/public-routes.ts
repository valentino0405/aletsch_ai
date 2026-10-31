/** Public documents, auth steps, and the separately authenticated ingest endpoint. */
export function isPublicPath(pathname: string): boolean {
  return pathname === "/" ||
    pathname === "/api/ingest" ||
    pathname === "/api/health" ||
    pathname === "/sign-in" || pathname.startsWith("/sign-in/") ||
    pathname === "/sign-up" || pathname.startsWith("/sign-up/");
}
