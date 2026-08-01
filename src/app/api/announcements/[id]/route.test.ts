import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockFindByIdAndUpdate, mockUpdateMany, mockAuth } = vi.hoisted(() => ({
  mockFindByIdAndUpdate: vi.fn(),
  mockUpdateMany: vi.fn(),
  mockAuth: vi.fn(),
}));

vi.mock("@/lib/db/connect", () => ({ dbConnect: vi.fn() }));
vi.mock("@/lib/models/announcement.model", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/models/announcement.model")>(
      "@/lib/models/announcement.model",
    );
  return {
    AnnouncementInputSchema: actual.AnnouncementInputSchema,
    AnnouncementModel: {
      findByIdAndUpdate: mockFindByIdAndUpdate,
      updateMany: mockUpdateMany,
    },
  };
});
vi.mock("../../../../../auth", () => ({ auth: mockAuth }));

import { PATCH } from "./route";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/announcements/ann-1", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("PATCH /api/announcements/[id]", () => {
  beforeEach(() => {
    mockAuth.mockClear();
    mockFindByIdAndUpdate.mockClear();
    mockUpdateMany.mockClear();
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await PATCH(makeRequest({ active: true }), makeParams("ann-1"));
    expect(res.status).toBe(401);
  });

  it("returns 404 when the announcement does not exist", async () => {
    mockAuth.mockResolvedValue({ user: { email: "admin@example.com" } });
    mockFindByIdAndUpdate.mockResolvedValue(null);

    const res = await PATCH(makeRequest({ active: true }), makeParams("missing-id"));
    expect(res.status).toBe(404);
  });

  it("deactivates other announcements when activating this one", async () => {
    mockAuth.mockResolvedValue({ user: { email: "admin@example.com" } });
    mockFindByIdAndUpdate.mockResolvedValue({ _id: "ann-1", active: true });

    await PATCH(makeRequest({ active: true }), makeParams("ann-1"));

    expect(mockUpdateMany).toHaveBeenCalledWith(
      { _id: { $ne: "ann-1" }, active: true },
      { active: false },
    );
  });

  it("does not touch other announcements when deactivating", async () => {
    mockAuth.mockResolvedValue({ user: { email: "admin@example.com" } });
    mockFindByIdAndUpdate.mockResolvedValue({ _id: "ann-1", active: false });

    const res = await PATCH(makeRequest({ active: false }), makeParams("ann-1"));

    expect(res.status).toBe(200);
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });
});
