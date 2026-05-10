import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockDbConnect, mockConnectionReadyState } = vi.hoisted(() => ({
  mockDbConnect: vi.fn(),
  mockConnectionReadyState: { value: 1 },
}));

vi.mock("@/lib/db/connect", () => ({
  dbConnect: mockDbConnect,
}));

vi.mock("mongoose", () => ({
  default: {
    get connection() {
      return { readyState: mockConnectionReadyState.value };
    },
  },
}));

import { GET } from "./route";

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConnectionReadyState.value = 1;
  });

  it("returns 200 with { status: 'ok', db: 'connected' } when DB is ready", async () => {
    mockDbConnect.mockResolvedValueOnce(undefined);
    mockConnectionReadyState.value = 1;

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ok", db: "connected" });
  });

  it("returns 200 with db: 'disconnected' when readyState is not 1", async () => {
    mockDbConnect.mockResolvedValueOnce(undefined);
    mockConnectionReadyState.value = 0;

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ok", db: "disconnected" });
  });

  it("returns 503 with { status: 'error', db: 'disconnected' } when dbConnect throws", async () => {
    mockDbConnect.mockRejectedValueOnce(new Error("connection refused"));

    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual({ status: "error", db: "disconnected" });
  });
});
