/**
 * Unit tests for GET /api/categories
 * Spec: specs/features/030-dynamic-category-filters.md  (AC1, AC2)
 *
 * Tests the route handler directly:
 *   1. Mocking dbConnect so no real MongoDB connection is made
 *   2. Mocking OfferModel.aggregate() with controllable return values
 *   3. Calling GET() and asserting on the JSON response body and status code
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── vi.hoisted ensures mockAggregate is available before vi.mock hoisting ──
const { mockAggregate } = vi.hoisted(() => {
  const mockAggregate = vi.fn();
  return { mockAggregate };
});

vi.mock("@/lib/db/connect", () => ({
  dbConnect: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/models/offer.model", () => ({
  OfferModel: {
    aggregate: mockAggregate,
  },
}));

import { GET } from "./route";

describe("GET /api/categories", () => {
  beforeEach(() => {
    mockAggregate.mockReset();
  });

  it("AC1 — returns sorted categories with counts from non-expired offers", async () => {
    mockAggregate.mockResolvedValue([
      { _id: "dining", count: 42 },
      { _id: "groceries", count: 31 },
      { _id: "online", count: 18 },
    ]);

    const res = await GET();
    const body = await res.json() as { data: Array<{ category: string; label: string; count: number }> };

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(3);
    expect(body.data[0]).toEqual({ category: "dining", label: "Dining", count: 42 });
    expect(body.data[1]).toEqual({ category: "groceries", label: "Groceries", count: 31 });
    expect(body.data[2]).toEqual({ category: "online", label: "Online", count: 18 });
  });

  it("AC1 — includes the Cache-Control header", async () => {
    mockAggregate.mockResolvedValue([]);

    const res = await GET();

    expect(res.headers.get("Cache-Control")).toContain("s-maxage=3600");
  });

  it("AC1 — filters out category values that are not in the CategorySchema enum", async () => {
    mockAggregate.mockResolvedValue([
      { _id: "dining", count: 10 },
      { _id: "unknown_future_category", count: 5 }, // not in schema
    ]);

    const res = await GET();
    const body = await res.json() as { data: Array<{ category: string }> };

    expect(body.data).toHaveLength(1);
    expect(body.data[0]!.category).toBe("dining");
  });

  it("AC1 — returns correct human-readable labels for all known categories", async () => {
    const knownCategories = [
      { _id: "dining", count: 5 },
      { _id: "groceries", count: 4 },
      { _id: "travel", count: 3 },
      { _id: "lodging", count: 2 },
      { _id: "shopping", count: 1 },
      { _id: "clothing", count: 1 },
      { _id: "homecare", count: 1 },
      { _id: "online", count: 1 },
      { _id: "wellness", count: 1 },
      { _id: "healthcare", count: 1 },
      { _id: "fuel", count: 1 },
      { _id: "entertainment", count: 1 },
      { _id: "installments", count: 1 },
      { _id: "other", count: 1 },
    ];
    mockAggregate.mockResolvedValue(knownCategories);

    const res = await GET();
    const body = await res.json() as { data: Array<{ category: string; label: string }> };

    const labelMap = Object.fromEntries(body.data.map((d) => [d.category, d.label]));
    expect(labelMap["dining"]).toBe("Dining");
    expect(labelMap["homecare"]).toBe("Home Care");
    expect(labelMap["installments"]).toBe("Installments");
    expect(labelMap["entertainment"]).toBe("Entertainment");
  });

  it("AC2 — returns 200 with { data: [] } when DB throws", async () => {
    mockAggregate.mockRejectedValue(new Error("MongoDB connection failed"));

    const res = await GET();
    const body = await res.json() as { data: unknown[] };

    expect(res.status).toBe(200);
    expect(body.data).toEqual([]);
  });

  it("AC2 — returns 200 with { data: [] } when dbConnect throws", async () => {
    const { dbConnect } = await import("@/lib/db/connect");
    vi.mocked(dbConnect).mockRejectedValueOnce(new Error("DB unavailable"));

    const res = await GET();
    const body = await res.json() as { data: unknown[] };

    expect(res.status).toBe(200);
    expect(body.data).toEqual([]);
  });

  it("returns empty data array when aggregate returns no results", async () => {
    mockAggregate.mockResolvedValue([]);

    const res = await GET();
    const body = await res.json() as { data: unknown[] };

    expect(res.status).toBe(200);
    expect(body.data).toEqual([]);
  });
});
