import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockCreate, mockFind, mockSort, mockLean } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockFind: vi.fn(),
  mockSort: vi.fn(),
  mockLean: vi.fn(),
}));

vi.mock("@/lib/db/connect", () => ({ dbConnect: vi.fn() }));

vi.mock("@/lib/models/feedback.model", () => ({
  FeedbackModel: {
    create: mockCreate,
    find: mockFind,
  },
}));

// Must import after mocks
import { POST, GET } from "./route";

function makeRequest(body?: unknown, searchParams?: string): NextRequest {
  const url = `http://localhost:3000/api/feedback${searchParams ? `?${searchParams}` : ""}`;
  return new NextRequest(url, {
    method: body ? "POST" : "GET",
    ...(body ? { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } } : {}),
  });
}

describe("POST /api/feedback", () => {
  beforeEach(() => {
    mockCreate.mockClear();
    mockCreate.mockResolvedValue({ _id: "abc123" });
  });

  it("returns 201 and id on valid input", async () => {
    const req = makeRequest({ type: "suggestion", message: "This is a great site, love it!" });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const data = await res.json() as { success: boolean; id: string };
    expect(data.success).toBe(true);
    expect(data.id).toBe("abc123");
  });

  it("saves type, message and email to the model", async () => {
    const req = makeRequest({ type: "bug", message: "The HNB offers are outdated.", email: "user@example.com" });
    await POST(req);
    expect(mockCreate).toHaveBeenCalledWith({ type: "bug", message: "The HNB offers are outdated.", email: "user@example.com" });
  });

  it("omits email when blank string is provided", async () => {
    const req = makeRequest({ type: "other", message: "General feedback here.", email: "" });
    await POST(req);
    expect(mockCreate).toHaveBeenCalledWith({ type: "other", message: "General feedback here.", email: undefined });
  });

  it("returns 400 when message is too short", async () => {
    const req = makeRequest({ type: "suggestion", message: "short" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when type is invalid", async () => {
    const req = makeRequest({ type: "invalid", message: "This is a valid length message." });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when email is malformed", async () => {
    const req = makeRequest({ type: "bug", message: "Valid length message here.", email: "not-an-email" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 500 when DB throws", async () => {
    mockCreate.mockRejectedValueOnce(new Error("DB error"));
    const req = makeRequest({ type: "suggestion", message: "Valid length message here." });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });
});

describe("GET /api/feedback", () => {
  const ADMIN_TOKEN = "test-admin-token";

  beforeEach(() => {
    vi.stubEnv("ADMIN_TOKEN", ADMIN_TOKEN);
    mockFind.mockClear();
    mockSort.mockClear();
    mockLean.mockClear();
    mockLean.mockResolvedValue([{ _id: "1", type: "bug", message: "A bug", status: "new" }]);
    mockSort.mockReturnValue({ lean: mockLean });
    mockFind.mockReturnValue({ sort: mockSort });
  });

  it("returns 401 when no token provided", async () => {
    const req = makeRequest(undefined, "");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 401 when wrong token provided", async () => {
    const req = makeRequest(undefined, "token=wrong");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 200 with data when correct token provided", async () => {
    const req = makeRequest(undefined, `token=${ADMIN_TOKEN}`);
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json() as { data: unknown[] };
    expect(Array.isArray(data.data)).toBe(true);
  });
});
