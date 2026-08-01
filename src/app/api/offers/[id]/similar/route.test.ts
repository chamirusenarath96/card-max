/**
 * Unit tests for GET /api/offers/[id]/similar
 * Spec: specs/features/046-offer-detail-page.md — AC7, AC8, AC9
 *
 * Mocks dbConnect and OfferModel so no real DB connection is needed.
 * Covers: category + date-overlap matching, excluding the source offer,
 * 404 for unknown source id, 400 for invalid ObjectId, category-only
 * fallback when the source has no validity dates, and the limit param.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── vi.hoisted: initialise mock refs before vi.mock hoisting ─────────────────

const { mockFindById, mockFindByIdLean, mockFind, mockLimit, mockLean } = vi.hoisted(() => {
  const mockLean = vi.fn();
  const mockSelect = vi.fn(() => ({ lean: mockLean }));
  const mockLimit = vi.fn(() => ({ select: mockSelect }));
  const mockSort = vi.fn(() => ({ limit: mockLimit }));
  const mockFind = vi.fn((_filter: Record<string, unknown>) => ({ sort: mockSort }));

  const mockFindByIdLean = vi.fn();
  const mockFindByIdSelect = vi.fn(() => ({ lean: mockFindByIdLean }));
  const mockFindById = vi.fn(() => ({ select: mockFindByIdSelect }));

  return { mockFindById, mockFindByIdLean, mockFind, mockLimit, mockLean };
});

vi.mock("@/lib/db/connect", () => ({
  dbConnect: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/models/offer.model", () => ({
  OfferModel: { findById: mockFindById, find: mockFind },
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

const SOURCE_ID = "64a000000000000000000001";
const UNKNOWN_ID = "64a000000000000000000002";
const BAD_ID = "not-an-object-id";

function makeSourceOffer(overrides: Record<string, unknown> = {}) {
  return {
    _id: { toString: () => SOURCE_ID },
    category: "dining",
    validFrom: new Date("2026-01-01"),
    validUntil: new Date("2026-12-31"),
    ...overrides,
  };
}

function makeSimilarOffer(overrides: Record<string, unknown> = {}) {
  return {
    _id: { toString: () => "64a000000000000000000003" },
    bank: "hnb",
    bankDisplayName: "Hatton National Bank",
    title: "10% off at KFC",
    merchant: "KFC",
    offerType: "percentage",
    discountPercentage: 10,
    discountLabel: "10% off",
    category: "dining",
    isExpired: false,
    sourceUrl: "https://www.hnb.lk/offers/kfc",
    scrapedAt: new Date("2026-01-01"),
    validFrom: new Date("2026-01-01"),
    validUntil: new Date("2026-12-31"),
    createdAt: new Date("2026-01-02"),
    updatedAt: new Date("2026-01-02"),
    ...overrides,
  };
}

function makeRequest(id: string, query = "") {
  return new NextRequest(`http://localhost:3000/api/offers/${id}/similar${query}`);
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

// ── Import route after mocks ──────────────────────────────────────────────────

import { GET } from "./route";

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/offers/[id]/similar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindByIdLean.mockResolvedValue(makeSourceOffer());
    mockLean.mockResolvedValue([makeSimilarOffer()]);
  });

  // AC7: same-category, date-overlapping offers

  it("returns 200 with { data: Offer[] } for a valid source id", async () => {
    const res = await GET(makeRequest(SOURCE_ID), makeParams(SOURCE_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({ merchant: "KFC", category: "dining" });
  });

  it("queries by the source offer's category and excludes expired offers", async () => {
    await GET(makeRequest(SOURCE_ID), makeParams(SOURCE_ID));
    expect(mockFind).toHaveBeenCalledWith(
      expect.objectContaining({ category: "dining", isExpired: false }),
    );
  });

  it("applies a validity-window overlap filter when the source has validity dates", async () => {
    await GET(makeRequest(SOURCE_ID), makeParams(SOURCE_ID));
    const filterArg = mockFind.mock.calls[0]![0] as Record<string, unknown>;
    expect(filterArg.validFrom).toEqual({ $lte: new Date("2026-12-31") });
    expect(filterArg.$or).toEqual([
      { validUntil: { $gte: new Date("2026-01-01") } },
      { validUntil: { $exists: false } },
    ]);
  });

  it("serialises _id and date fields", async () => {
    const res = await GET(makeRequest(SOURCE_ID), makeParams(SOURCE_ID));
    const { data } = await res.json();
    expect(typeof data[0]._id).toBe("string");
    expect(data[0].validFrom).toBe("2026-01-01T00:00:00.000Z");
  });

  // AC7 fallback: category-only when source has no validity dates

  it("falls back to category-only matching when the source has no validity dates", async () => {
    mockFindByIdLean.mockResolvedValue(
      makeSourceOffer({ validFrom: undefined, validUntil: undefined }),
    );
    await GET(makeRequest(SOURCE_ID), makeParams(SOURCE_ID));
    const filterArg = mockFind.mock.calls[0]![0] as Record<string, unknown>;
    expect(filterArg).not.toHaveProperty("validFrom");
    expect(filterArg).not.toHaveProperty("$or");
    expect(filterArg).toEqual({ _id: { $ne: SOURCE_ID }, category: "dining", isExpired: false });
  });

  // AC8: excludes the source offer itself

  it("excludes the source offer's own id from the query", async () => {
    await GET(makeRequest(SOURCE_ID), makeParams(SOURCE_ID));
    const filterArg = mockFind.mock.calls[0]![0] as Record<string, unknown>;
    expect(filterArg._id).toEqual({ $ne: SOURCE_ID });
  });

  // AC9: 404 for unknown source id

  it("returns 404 when the source offer does not exist", async () => {
    mockFindByIdLean.mockResolvedValue(null);
    const res = await GET(makeRequest(UNKNOWN_ID), makeParams(UNKNOWN_ID));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: "Offer not found" });
  });

  // 400: malformed ObjectId

  it("returns 400 for an invalid ObjectId string", async () => {
    const res = await GET(makeRequest(BAD_ID), makeParams(BAD_ID));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: "Invalid id" });
  });

  it("does not call dbConnect or findById for an invalid id", async () => {
    await GET(makeRequest(BAD_ID), makeParams(BAD_ID));
    expect(mockFindById).not.toHaveBeenCalled();
  });

  // limit param

  it("defaults the limit to 6", async () => {
    await GET(makeRequest(SOURCE_ID), makeParams(SOURCE_ID));
    expect(mockLimit).toHaveBeenCalledWith(6);
  });

  it("respects a custom limit query param", async () => {
    await GET(makeRequest(SOURCE_ID, "?limit=3"), makeParams(SOURCE_ID));
    expect(mockLimit).toHaveBeenCalledWith(3);
  });

  it("caps the limit at 20 even if a larger value is requested", async () => {
    await GET(makeRequest(SOURCE_ID, "?limit=100"), makeParams(SOURCE_ID));
    expect(mockLimit).toHaveBeenCalledWith(20);
  });

  it("falls back to the default limit for an invalid limit value", async () => {
    await GET(makeRequest(SOURCE_ID, "?limit=notanumber"), makeParams(SOURCE_ID));
    expect(mockLimit).toHaveBeenCalledWith(6);
  });

  // 500: unexpected DB error

  it("returns 500 when findById throws an unexpected error", async () => {
    mockFindById.mockImplementationOnce(() => {
      throw new Error("DB connection failed");
    });
    const res = await GET(makeRequest(SOURCE_ID), makeParams(SOURCE_ID));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: "Internal server error" });
  });
});
