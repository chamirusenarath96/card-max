/**
 * Unit tests for src/middleware.ts (spec 015 — API Rate Limiting)
 *
 * @upstash/ratelimit and @upstash/redis are mocked so no real network calls
 * are made. Integration tests against real Upstash counters require a live
 * Upstash instance and are approximated here with mocks.
 * TODO: integration test needs real DB
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── vi.hoisted: initialised before vi.mock hoisting ──────────────────────────

const { mockLimit } = vi.hoisted(() => ({
  mockLimit: vi.fn(),
}));

vi.mock("@upstash/ratelimit", () => {
  const MockRatelimit = vi.fn(() => ({ limit: mockLimit }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (MockRatelimit as any).slidingWindow = vi.fn(() => ({}));
  return { Ratelimit: MockRatelimit };
});

vi.mock("@upstash/redis", () => ({
  Redis: vi.fn(() => ({})),
}));

import { middleware } from "./middleware";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(pathname: string, options: { ip?: string } = {}) {
  const url = new URL(`http://localhost:3000${pathname}`);
  const headers: Record<string, string> = {};
  if (options.ip) headers["x-forwarded-for"] = options.ip;
  return new NextRequest(url, { headers });
}

const RESET_TS = Date.now() + 30_000;

function allowedResult(remaining = 47) {
  return { success: true, limit: 60, remaining, reset: RESET_TS };
}

function blockedResult(limitVal = 60) {
  return { success: false, limit: limitVal, remaining: 0, reset: RESET_TS };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("middleware — rate limiting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── AC2, AC4: /api/offers — 429 when limit exceeded (mock-based approximation)
  // TODO: integration test needs real DB (real Upstash counter reaching 61st request)
  it("returns 429 for /api/offers when rate limit is exceeded", async () => {
    mockLimit.mockResolvedValueOnce(blockedResult(60));
    const res = await middleware(makeRequest("/api/offers", { ip: "1.2.3.4" }));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("Too many requests");
    expect(typeof body.retryAfter).toBe("number");
  });

  // ── AC3, AC4: /api/search — 429 when limit exceeded (mock-based approximation)
  // TODO: integration test needs real DB (real Upstash counter reaching 21st request)
  it("returns 429 for /api/search when rate limit is exceeded", async () => {
    mockLimit.mockResolvedValueOnce(blockedResult(20));
    const res = await middleware(makeRequest("/api/search", { ip: "1.2.3.4" }));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("Too many requests");
  });

  // ── AC5: rate limit headers present on allowed response (mock-based)
  // TODO: integration test needs real DB
  it("sets X-RateLimit-* headers on an allowed response", async () => {
    mockLimit.mockResolvedValueOnce(allowedResult(47));
    const res = await middleware(makeRequest("/api/offers", { ip: "1.2.3.4" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("X-RateLimit-Limit")).toBe("60");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("47");
    expect(res.headers.get("X-RateLimit-Reset")).toBe(String(RESET_TS));
  });

  // ── AC5: rate limit headers + Retry-After present on 429 response
  it("sets X-RateLimit-* and Retry-After headers on a 429 response", async () => {
    mockLimit.mockResolvedValueOnce(blockedResult(60));
    const res = await middleware(makeRequest("/api/offers", { ip: "1.2.3.4" }));
    expect(res.status).toBe(429);
    expect(res.headers.get("X-RateLimit-Limit")).toBe("60");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(res.headers.get("Retry-After")).toBeTruthy();
  });

  // ── AC6: Upstash unreachable / missing env → fail open (pass request through)
  it("passes request through when Upstash limit() throws (fail open)", async () => {
    mockLimit.mockRejectedValueOnce(new Error("connect ECONNREFUSED"));
    const res = await middleware(makeRequest("/api/offers", { ip: "1.2.3.4" }));
    expect(res.status).toBe(200);
    // No rate limit headers on fail-open path
    expect(res.headers.get("Retry-After")).toBeNull();
  });

  // ── AC8: non-rate-limited path passes through without calling limit()
  it("does not rate limit a page route (passes through without calling limit)", async () => {
    const res = await middleware(makeRequest("/"));
    expect(res.status).toBe(200);
    expect(mockLimit).not.toHaveBeenCalled();
  });

  // ── AC8: other /api/* paths not in the limiter map pass through
  it("passes through /api/health without rate limiting", async () => {
    const res = await middleware(makeRequest("/api/health"));
    expect(res.status).toBe(200);
    expect(mockLimit).not.toHaveBeenCalled();
  });

  // ── IP extraction: uses first IP from x-forwarded-for chain
  it("uses the first IP from a comma-separated x-forwarded-for header", async () => {
    mockLimit.mockResolvedValueOnce(allowedResult());
    await middleware(
      makeRequest("/api/offers", { ip: "10.0.0.1, 10.0.0.2, 10.0.0.3" })
    );
    expect(mockLimit).toHaveBeenCalledWith("10.0.0.1");
  });

  // ── IP fallback: no x-forwarded-for → "anonymous"
  it('falls back to "anonymous" when x-forwarded-for is absent', async () => {
    mockLimit.mockResolvedValueOnce(allowedResult());
    await middleware(makeRequest("/api/offers"));
    expect(mockLimit).toHaveBeenCalledWith("anonymous");
  });

  // ── Allowed request passes through (status 200, no Retry-After)
  it("passes an allowed request through with status 200", async () => {
    mockLimit.mockResolvedValueOnce(allowedResult(59));
    const res = await middleware(makeRequest("/api/offers", { ip: "5.5.5.5" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Retry-After")).toBeNull();
  });
});
