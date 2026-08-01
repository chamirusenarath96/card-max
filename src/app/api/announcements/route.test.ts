import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockFind, mockSort, mockLean, mockCreate, mockUpdateMany, mockAuth } = vi.hoisted(() => ({
  mockFind: vi.fn(),
  mockSort: vi.fn(),
  mockLean: vi.fn(),
  mockCreate: vi.fn(),
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
      find: mockFind,
      create: mockCreate,
      updateMany: mockUpdateMany,
    },
  };
});
vi.mock("../../../../auth", () => ({ auth: mockAuth }));

import { GET, POST } from "./route";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/announcements", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("GET /api/announcements", () => {
  beforeEach(() => {
    mockAuth.mockClear();
    mockFind.mockClear();
    mockSort.mockClear();
    mockLean.mockClear();
    mockSort.mockReturnValue({ lean: mockLean });
    mockFind.mockReturnValue({ sort: mockSort });
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns the announcement list when authenticated", async () => {
    mockAuth.mockResolvedValue({ user: { email: "admin@example.com" } });
    mockLean.mockResolvedValue([{ _id: "ann-1", message: "Hi", active: false }]);

    const res = await GET();
    const body = (await res.json()) as { data: unknown[] };

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
  });
});

describe("POST /api/announcements", () => {
  beforeEach(() => {
    mockAuth.mockClear();
    mockCreate.mockClear();
    mockUpdateMany.mockClear();
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(makeRequest({ message: "Hello" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid input", async () => {
    mockAuth.mockResolvedValue({ user: { email: "admin@example.com" } });
    const res = await POST(makeRequest({ message: "" }));
    expect(res.status).toBe(400);
  });

  it("creates an announcement when authenticated with valid input", async () => {
    mockAuth.mockResolvedValue({ user: { email: "admin@example.com" } });
    mockCreate.mockResolvedValue({ _id: "ann-new", message: "Hello", active: false });

    const res = await POST(makeRequest({ message: "Hello" }));
    const body = (await res.json()) as { success: boolean };

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it("deactivates other announcements when creating an active one", async () => {
    mockAuth.mockResolvedValue({ user: { email: "admin@example.com" } });
    mockCreate.mockResolvedValue({ _id: "ann-new", message: "Hello", active: true });

    await POST(makeRequest({ message: "Hello", active: true }));

    expect(mockUpdateMany).toHaveBeenCalledWith({ active: true }, { active: false });
  });
});
