import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockDbConnect } = vi.hoisted(() => ({
  mockDbConnect: vi.fn(),
}));

vi.mock("@/lib/db/connect", () => ({
  dbConnect: mockDbConnect,
}));

import { GET } from "./route";

describe("GET /api/ping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns { ok: true } when dbConnect succeeds", async () => {
    mockDbConnect.mockResolvedValueOnce(undefined);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });

  it("returns 503 with { ok: false } when dbConnect throws", async () => {
    mockDbConnect.mockRejectedValueOnce(new Error("connection refused"));
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual({ ok: false });
  });
});
