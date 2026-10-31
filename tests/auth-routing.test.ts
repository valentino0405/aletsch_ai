import assert from "node:assert/strict";
import test from "node:test";
import { isPublicPath } from "../lib/auth/public-routes";

test("auth pages and their verification steps remain public", () => {
  for (const path of ["/", "/sign-in", "/sign-in/factor-one", "/sign-up", "/sign-up/verify-email-address", "/api/ingest", "/api/health"]) {
    assert.equal(isPublicPath(path), true, path);
  }
});

test("private routes cannot bypass authentication with an auth-page prefix", () => {
  for (const path of ["/dashboard", "/api/projects", "/api/alerts", "/sign-in-admin", "/sign-up-settings", "/api/ingest/private"]) {
    assert.equal(isPublicPath(path), false, path);
  }
});
