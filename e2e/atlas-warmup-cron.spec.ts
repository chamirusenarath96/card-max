/**
 * E2E tests for Atlas Warmup Cron (spec 012)
 *
 * Tests that /api/health returns the expected JSON shape.
 * The resilient pattern accepts both 200 (DB available) and 503 (no DB in CI)
 * since CI has no MongoDB connection.
 */
import { test, expect } from "@playwright/test";

test.describe("Atlas Warmup — /api/health endpoint (Feature 012)", () => {
  test("health endpoint returns expected JSON shape", async ({ request }) => {
    const res = await request.get("/api/health");

    // Accept 200 (connected) or 503 (no DB in CI) — endpoint must exist either way
    expect([200, 503]).toContain(res.status());

    const body = await res.json();
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("db");
    expect(["ok", "error"]).toContain(body.status);
    expect(["connected", "disconnected"]).toContain(body.db);
  });

  test("health endpoint returns 200 with db status when DB is available", async ({
    request,
  }) => {
    const res = await request.get("/api/health");
    const body = await res.json();

    if (res.status() === 200) {
      // DB is reachable: verify the full success shape
      expect(body).toEqual({ status: "ok", db: "connected" });
    } else {
      // CI has no DB — 503 with error shape is acceptable
      // TODO: integration test needs real DB
      expect(body).toEqual({ status: "error", db: "disconnected" });
    }
  });
});
