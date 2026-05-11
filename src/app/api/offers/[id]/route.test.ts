/**
 * Unit tests for GET /api/offers/[id]
 * Spec: specs/features/005-offer-detail.md — AC1, AC2
 *
 * Mocks dbConnect and OfferModel so no real DB connection is needed.
 * Covers: 200 with offer data, 404 for unknown id, 400 for invalid ObjectId,
 * 500 on unexpected DB error, and date serialisation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── vi.hoisted: initialise mock refs before vi.mock hoisting ─────────────────

const { mockFindById, mockSelect, mockLean } = vi.hoisted(() => {
  const mockLean = vi.fn();
  const mockSelect = vi.fn(() => ({ lean: mockLean }));
  const mockFindById = vi.fn(() => ({ select: mockSelect }));
  return { mockFindById, mockSelect, mockLean };
});

vi.mock("@/lib/db/connect", () => ({
  dbConnect: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/models/offer.model", () => ({
  OfferModel: { findById: mockFindById },
}));

// ── Helper: valid MongoDB ObjectId string ─────────────────────────────────────

const VALID_ID = "64a000000000000000000001";
const UNKNOWN_ID = "64a000000000000000000002";
const BAD_ID = "not-an-object-id";

function makeOffer(overrides: Record<string, unknown> = {}) {
  return {
    _id: { toString: () => VALID_ID },
    bank: "hnb",
    bankDisplayName: "Hatton National Bank",
    title: "20% off at Pizza Hut",
    merchant: "Pizza Hut",
    offerType: "percentage",
    discountPercentage: 20,
    discountLabel: "20% off",
    category: "dining",
    isExpired: false,
    sourceUrl: "https://www.hnb.lk/offers/pizza-hut",
    scrapedAt: new Date("2026-01-01"),
    validFrom: new Date("2026-01-01"),
    validUntil: new Date("2026-12-31"),
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

function makeRequest(id: string) {
  return new NextRequest(`http://localhost:3000/api/offers/${id}`);
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

// ── Import route after mocks ──────────────────────────────────────────────────

import { GET } from "./route";

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/offers/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLean.mockResolvedValue(makeOffer());
  });

  // AC1: returns 200 with offer data when id exists

  it("returns 200 with { data: Offer } for a valid id that exists", async () => {
    const res = await GET(makeRequest(VALID_ID), makeParams(VALID_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("data");
    expect(body.data).toMatchObject({
      bank: "hnb",
      title: "20% off at Pizza Hut",
      merchant: "Pizza Hut",
    });
  });

  it("serialises _id as a string", async () => {
    const res = await GET(makeRequest(VALID_ID), makeParams(VALID_ID));
    const { data } = await res.json();
    expect(typeof data._id).toBe("string");
    expect(data._id).toBe(VALID_ID);
  });

  it("serialises date fields to ISO strings", async () => {
    const res = await GET(makeRequest(VALID_ID), makeParams(VALID_ID));
    const { data } = await res.json();
    expect(data.scrapedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(data.validFrom).toBe("2026-01-01T00:00:00.000Z");
    expect(data.validUntil).toBe("2026-12-31T00:00:00.000Z");
  });

  it("serialises null for missing date fields", async () => {
    mockLean.mockResolvedValue(
      makeOffer({ scrapedAt: undefined, validFrom: undefined, validUntil: undefined }),
    );
    const res = await GET(makeRequest(VALID_ID), makeParams(VALID_ID));
    const { data } = await res.json();
    expect(data.scrapedAt).toBeNull();
    expect(data.validFrom).toBeNull();
    expect(data.validUntil).toBeNull();
  });

  it("calls findById with the correct id", async () => {
    await GET(makeRequest(VALID_ID), makeParams(VALID_ID));
    expect(mockFindById).toHaveBeenCalledWith(VALID_ID);
  });

  it("excludes __v from the projection", async () => {
    await GET(makeRequest(VALID_ID), makeParams(VALID_ID));
    expect(mockSelect).toHaveBeenCalledWith("-__v");
  });

  // AC2: returns 404 when id is valid ObjectId but no document found

  it("returns 404 when offer is not found", async () => {
    mockLean.mockResolvedValue(null);
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

  // 500: unexpected DB error

  it("returns 500 when findById throws an unexpected error", async () => {
    mockFindById.mockImplementationOnce(() => {
      throw new Error("DB connection failed");
    });
    const res = await GET(makeRequest(VALID_ID), makeParams(VALID_ID));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: "Internal server error" });
  });
});
