/**
 * Unit tests for GET /api/offers
 *
 * We test the route handler directly by:
 *   1. Mocking dbConnect so no real MongoDB connection is made
 *   2. Mocking OfferModel with controllable return values
 *   3. Constructing a NextRequest and calling GET()
 *   4. Asserting on the JSON response body and status code
 *
 * This is a pure unit test — no network, no database.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── vi.hoisted ensures these variables are initialised before vi.mock hoisting ─

const {
  mockLean,
  mockSkip,
  mockSort,
  mockFind,
  mockCount,
} = vi.hoisted(() => {
  const mockLean = vi.fn();
  const mockSelect = vi.fn(() => ({ lean: mockLean }));
  const mockLimit = vi.fn(() => ({ select: mockSelect }));
  const mockSkip = vi.fn(() => ({ limit: mockLimit }));
  const mockSort = vi.fn(() => ({ skip: mockSkip }));
  const mockFind = vi.fn((/* filter */) => ({ sort: mockSort }));
  const mockCount = vi.fn();
  return { mockLean, mockSkip, mockSort, mockFind, mockCount };
});

vi.mock("@/lib/db/connect", () => ({
  dbConnect: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/models/offer.model", () => ({
  OfferModel: {
    find: mockFind,
    countDocuments: mockCount,
  },
}));

/** Get the filter argument passed to the most recent OfferModel.find() call */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function lastFindFilter(): any {
  const calls = mockFind.mock.calls as unknown[][];
  if (!calls.length) throw new Error("mockFind was not called");
  return calls[calls.length - 1]![0];
}

// ── Helper to build a fake Offer ─────────────────────────────────────────────

function makeOffer(overrides: Record<string, unknown> = {}) {
  return {
    _id: "64a000000000000000000001",
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
    ...overrides,
  };
}

// ── Helper to make a NextRequest ─────────────────────────────────────────────

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL("http://localhost:3000/api/offers");
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url);
}

// ── Import route after mocks are registered ──────────────────────────────────

import { GET } from "./route";

// ── Tests ────────────────────────────────────────────────────────────────────

describe("GET /api/offers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLean.mockResolvedValue([makeOffer()]);
    mockCount.mockResolvedValue(1);
  });

  // ── Happy-path ────────────────────────────────────────────────────────────

  it("returns 200 with data and pagination by default", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.pagination).toMatchObject({
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    });
  });

  it("returns the offer fields including offerType and discountPercentage", async () => {
    const res = await GET(makeRequest());
    const { data } = await res.json();
    expect(data[0]).toMatchObject({
      offerType: "percentage",
      discountPercentage: 20,
      discountLabel: "20% off",
    });
  });

  // ── Filter: bank ──────────────────────────────────────────────────────────

  it("passes bank filter to OfferModel.find", async () => {
    await GET(makeRequest({ bank: "hnb" }));
    expect(mockFind).toHaveBeenCalledWith(
      expect.objectContaining({ bank: "hnb" })
    );
  });

  // ── Filter: category ─────────────────────────────────────────────────────

  it("passes category filter to OfferModel.find", async () => {
    await GET(makeRequest({ category: "dining" }));
    expect(mockFind).toHaveBeenCalledWith(
      expect.objectContaining({ category: "dining" })
    );
  });

  // ── Filter: offerType ─────────────────────────────────────────────────────

  it("passes offerType filter to OfferModel.find", async () => {
    await GET(makeRequest({ offerType: "bogo" }));
    expect(mockFind).toHaveBeenCalledWith(
      expect.objectContaining({ offerType: "bogo" })
    );
  });

  // ── Filter: minDiscount / maxDiscount ─────────────────────────────────────

  it("builds discountPercentage $gte filter for minDiscount", async () => {
    await GET(makeRequest({ minDiscount: "20" }));
    expect(mockFind).toHaveBeenCalledWith(
      expect.objectContaining({
        discountPercentage: expect.objectContaining({ $gte: 20 }),
      })
    );
  });

  it("builds discountPercentage $lte filter for maxDiscount", async () => {
    await GET(makeRequest({ maxDiscount: "30" }));
    expect(mockFind).toHaveBeenCalledWith(
      expect.objectContaining({
        discountPercentage: expect.objectContaining({ $lte: 30 }),
      })
    );
  });

  it("combines minDiscount and maxDiscount into a range filter", async () => {
    await GET(makeRequest({ minDiscount: "15", maxDiscount: "50" }));
    expect(mockFind).toHaveBeenCalledWith(
      expect.objectContaining({
        discountPercentage: { $gte: 15, $lte: 50 },
      })
    );
  });

  // ── Filter: activeOn ──────────────────────────────────────────────────────

  it("builds date filter for activeOn", async () => {
    await GET(makeRequest({ activeOn: "2026-06-15" }));
    const filterArg = lastFindFilter();
    expect(filterArg.validFrom).toMatchObject({ $lte: expect.any(Date) });
    expect(filterArg.$or).toBeDefined();
  });

  // ── Filter: activeFrom / activeTo ─────────────────────────────────────────

  it("builds overlap filter for activeFrom", async () => {
    await GET(makeRequest({ activeFrom: "2026-03-01" }));
    const filterArg = lastFindFilter();
    expect(filterArg.$or).toBeDefined();
  });

  it("builds validFrom.$lte filter for activeTo", async () => {
    await GET(makeRequest({ activeTo: "2026-12-31" }));
    const filterArg = lastFindFilter();
    expect(filterArg.validFrom).toMatchObject({ $lte: expect.any(Date) });
  });

  it("builds combined overlap filter for activeFrom + activeTo", async () => {
    await GET(makeRequest({ activeFrom: "2026-03-01", activeTo: "2026-06-30" }));
    const filterArg = lastFindFilter();
    expect(filterArg.validFrom).toMatchObject({ $lte: expect.any(Date) });
    expect(filterArg.$or).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ validUntil: { $gte: expect.any(Date) } }),
      ])
    );
  });

  it("returns 200 when activeFrom and activeTo are valid ISO dates", async () => {
    const res = await GET(makeRequest({ activeFrom: "2026-01-01", activeTo: "2026-12-31" }));
    expect(res.status).toBe(200);
  });

  // ── Sort: latest (default) ───────────────────────────────────────────

  it("sorts by createdAt descending by default (latest)", async () => {
    await GET(makeRequest());
    expect(mockSort).toHaveBeenCalledWith({ createdAt: -1 });
  });

  it("sorts by createdAt descending when sort=latest", async () => {
    await GET(makeRequest({ sort: "latest" }));
    expect(mockSort).toHaveBeenCalledWith({ createdAt: -1 });
  });

  // ── Sort: expiringSoon ──────────────────────────────────────────────

  it("sorts by validUntil ascending when sort=expiringSoon", async () => {
    await GET(makeRequest({ sort: "expiringSoon" }));
    expect(mockSort).toHaveBeenCalledWith({ validUntil: 1 });
  });

  it("filters validUntil within 3 days when sort=expiringSoon", async () => {
    await GET(makeRequest({ sort: "expiringSoon" }));
    const filterArg = lastFindFilter();
    expect(filterArg.validUntil).toBeDefined();
    expect(filterArg.validUntil.$gte).toBeInstanceOf(Date);
    expect(filterArg.validUntil.$lte).toBeInstanceOf(Date);
    const diffMs = filterArg.validUntil.$lte.getTime() - filterArg.validUntil.$gte.getTime();
    const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
    expect(diffMs).toBeLessThanOrEqual(threeDaysMs + 1000);
    expect(diffMs).toBeGreaterThan(0);
  });

  // ── Filter: includeExpired ────────────────────────────────────────────────

  it("hides expired offers by default", async () => {
    await GET(makeRequest());
    expect(mockFind).toHaveBeenCalledWith(
      expect.objectContaining({ isExpired: false })
    );
  });

  it("removes isExpired filter when includeExpired=true", async () => {
    await GET(makeRequest({ includeExpired: "true" }));
    const filterArg = lastFindFilter();
    expect(filterArg.isExpired).toBeUndefined();
  });

  // ── Full-text search ──────────────────────────────────────────────────────

  it("adds $text search when q param is provided", async () => {
    await GET(makeRequest({ q: "pizza" }));
    expect(mockFind).toHaveBeenCalledWith(
      expect.objectContaining({ $text: { $search: "pizza" } })
    );
  });

  // ── Pagination ────────────────────────────────────────────────────────────

  it("calculates totalPages from total and limit", async () => {
    mockCount.mockResolvedValue(45);
    const res = await GET(makeRequest({ limit: "20" }));
    const { pagination } = await res.json();
    expect(pagination.totalPages).toBe(3);
  });

  it("applies correct skip for page 2", async () => {
    await GET(makeRequest({ page: "2", limit: "20" }));
    expect(mockSkip).toHaveBeenCalledWith(20);
  });

  // ── Validation errors ─────────────────────────────────────────────────────

  it("returns 400 for invalid bank value", async () => {
    const res = await GET(makeRequest({ bank: "invalid_bank" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid query parameters");
  });

  it("returns 400 for invalid offerType value", async () => {
    const res = await GET(makeRequest({ offerType: "mystery_deal" }));
    expect(res.status).toBe(400);
    expect(res.status).toBe(400);
  });

  it("returns 400 for minDiscount above 100", async () => {
    const res = await GET(makeRequest({ minDiscount: "101" }));
    expect(res.status).toBe(400);
  });

  // ── Error handling ────────────────────────────────────────────────────────

  it("returns 500 when OfferModel.find throws", async () => {
    mockFind.mockImplementationOnce(() => {
      throw new Error("DB connection failed");
    });
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Internal server error");
  });
});
