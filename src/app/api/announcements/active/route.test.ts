import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockFindOne, mockSort, mockLean } = vi.hoisted(() => ({
  mockFindOne: vi.fn(),
  mockSort: vi.fn(),
  mockLean: vi.fn(),
}));

vi.mock("@/lib/db/connect", () => ({ dbConnect: vi.fn() }));
vi.mock("@/lib/models/announcement.model", () => ({
  AnnouncementModel: { findOne: mockFindOne },
}));

import { GET } from "./route";

describe("GET /api/announcements/active", () => {
  beforeEach(() => {
    mockFindOne.mockClear();
    mockSort.mockClear();
    mockLean.mockClear();
    mockSort.mockReturnValue({ lean: mockLean });
    mockFindOne.mockReturnValue({ sort: mockSort });
  });

  it("returns the active announcement", async () => {
    mockLean.mockResolvedValue({ _id: "ann-1", message: "Hello", active: true });

    const res = await GET();
    const body = (await res.json()) as { data: unknown };

    expect(res.status).toBe(200);
    expect(mockFindOne).toHaveBeenCalledWith({ active: true });
    expect(body.data).toEqual({ _id: "ann-1", message: "Hello", active: true });
  });

  it("returns null when no announcement is active", async () => {
    mockLean.mockResolvedValue(null);

    const res = await GET();
    const body = (await res.json()) as { data: unknown };

    expect(res.status).toBe(200);
    expect(body.data).toBeNull();
  });

  it("returns 500 when the database throws", async () => {
    mockLean.mockRejectedValue(new Error("db down"));

    const res = await GET();
    expect(res.status).toBe(500);
  });
});
