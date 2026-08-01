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
 *
 * Atlas Search path (spec 013): OfferModel.aggregate() is called when q is
 * provided. Integration tests for relevance ranking require a real Atlas Search
 * index and are approximated here with mocks.
 * TODO: integration test needs real DB
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── vi.hoisted ensures these variables are initialised before vi.mock hoisting ─

const {
  mockAggregate,
  mockLean,
  mockSkip,
  mockSort,
  mockFind,
  mockCount,
  mockEstimatedCount,
} = vi.hoisted(() => {
  const mockLean = vi.fn();
  const mockSelect = vi.fn(() => ({ lean: mockLean }));
  const mockLimit = vi.fn(() => ({ select: mockSelect }));
  const mockSkip = vi.fn(() => ({ limit: mockLimit }));
  const mockSort = vi.fn(() => ({ skip: mockSkip }));
  const mockFind = vi.fn((/* filter */) => ({ sort: mockSort }));
  const mockCount = vi.fn();
  const mockEstimatedCount = vi.fn();
  const mockAggregate = vi.fn();
  return { mockAggregate, mockLean, mockSkip, mockSort, mockFind, mockCount, mockEstimatedCount };
});

vi.mock("@/lib/db/connect", () => ({
  dbConnect: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/models/offer.model", () => ({
  OfferModel: {
    find: mockFind,
    countDocuments: mockCount,
    estimatedDocumentCount: mockEstimatedCount,
    aggregate: mockAggregate,
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
    mockEstimatedCount.mockResolvedValue(1);
    // aggregate is NOT set up here — each Atlas Search test configures its own mock
    // so that mockResolvedValueOnce queues don't cross-contaminate tests
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

  it("passes single bank as equality filter to OfferModel.find", async () => {
    await GET(makeRequest({ bank: "hnb" }));
    expect(mockFind).toHaveBeenCalledWith(
      expect.objectContaining({ bank: "hnb" })
    );
  });

  it("AC9 — multiple bank params produce a $in filter", async () => {
    const url = new URL("http://localhost:3000/api/offers");
    url.searchParams.append("bank", "hnb");
    url.searchParams.append("bank", "sampath_bank");
    await GET(new NextRequest(url));
    expect(mockFind).toHaveBeenCalledWith(
      expect.objectContaining({ bank: { $in: ["hnb", "sampath_bank"] } })
    );
  });

  // ── Filter: category ─────────────────────────────────────────────────────

  it("passes single category as equality filter to OfferModel.find", async () => {
    await GET(makeRequest({ category: "dining" }));
    expect(mockFind).toHaveBeenCalledWith(
      expect.objectContaining({ category: "dining" })
    );
  });

  it("multiple category params produce a $in filter", async () => {
    const url = new URL("http://localhost:3000/api/offers");
    url.searchParams.append("category", "dining");
    url.searchParams.append("category", "travel");
    await GET(new NextRequest(url));
    expect(mockFind).toHaveBeenCalledWith(
      expect.objectContaining({ category: { $in: ["dining", "travel"] } })
    );
  });

  // ── Filter: offerType ─────────────────────────────────────────────────────

  it("passes single offerType as equality filter to OfferModel.find", async () => {
    await GET(makeRequest({ offerType: "bogo" }));
    expect(mockFind).toHaveBeenCalledWith(
      expect.objectContaining({ offerType: "bogo" })
    );
  });

  it("multiple offerType params produce a $in filter", async () => {
    const url = new URL("http://localhost:3000/api/offers");
    url.searchParams.append("offerType", "percentage");
    url.searchParams.append("offerType", "cashback");
    await GET(new NextRequest(url));
    expect(mockFind).toHaveBeenCalledWith(
      expect.objectContaining({ offerType: { $in: ["percentage", "cashback"] } })
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
    expect(mockSort).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
  });

  it("sorts by createdAt descending when sort=latest", async () => {
    await GET(makeRequest({ sort: "latest" }));
    expect(mockSort).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
  });

  // ── Sort: expiringSoon ──────────────────────────────────────────────

  it("sorts by validUntil ascending when sort=expiringSoon", async () => {
    await GET(makeRequest({ sort: "expiringSoon" }));
    expect(mockSort).toHaveBeenCalledWith({ validUntil: 1, _id: 1 });
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

  // ── Atlas Search (spec 013) ───────────────────────────────────────────────

  // AC5: no q → uses find() not aggregate()
  it("uses find() not aggregate() when q is absent", async () => {
    await GET(makeRequest());
    expect(mockFind).toHaveBeenCalled();
    expect(mockAggregate).not.toHaveBeenCalled();
  });

  // AC5: empty q string treated as absent
  it("uses find() when q is an empty string", async () => {
    await GET(makeRequest({ q: "" }));
    expect(mockFind).toHaveBeenCalled();
    expect(mockAggregate).not.toHaveBeenCalled();
  });

  // AC2: q present → Atlas Search aggregate pipeline used, not find()
  // TODO: integration test needs real DB to verify actual relevance ranking
  it("uses aggregate() not find() when q is provided (Atlas Search path)", async () => {
    mockAggregate
      .mockResolvedValueOnce([makeOffer()])
      .mockResolvedValueOnce([{ total: 1 }]);

    const res = await GET(makeRequest({ q: "pizza" }));
    expect(res.status).toBe(200);
    expect(mockAggregate).toHaveBeenCalled();
    expect(mockFind).not.toHaveBeenCalled();
  });

  // AC2: aggregate pipeline includes $search stage with correct index name
  it("calls aggregate with $search stage on offers_search index", async () => {
    mockAggregate
      .mockResolvedValueOnce([makeOffer()])
      .mockResolvedValueOnce([{ total: 1 }]);

    await GET(makeRequest({ q: "pizza" }));

    const firstCallPipeline = mockAggregate.mock.calls[0]![0] as unknown[];
    const searchStage = firstCallPipeline[0] as Record<string, unknown>;
    expect(searchStage).toHaveProperty("$search");
    const searchBody = searchStage["$search"] as Record<string, unknown>;
    expect(searchBody.index).toBe("offers_search");
  });

  // AC3: typo query uses fuzzy matching (terms ≥ 4 chars)
  // TODO: integration test needs real DB to verify Atlas Search fuzzy results
  it("includes fuzzy config in $search stage for terms of 4+ characters", async () => {
    mockAggregate
      .mockResolvedValueOnce([makeOffer()])
      .mockResolvedValueOnce([{ total: 1 }]);

    await GET(makeRequest({ q: "piza" })); // 4-char typo query

    const pipeline = mockAggregate.mock.calls[0]![0] as unknown[];
    const searchStage = pipeline[0] as Record<string, unknown>;
    const compound = (searchStage["$search"] as Record<string, unknown>)
      .compound as Record<string, unknown>;
    const shouldClauses = compound.should as Array<Record<string, unknown>>;
    const firstClause = shouldClauses[0]!.text as Record<string, unknown>;
    expect(firstClause).toHaveProperty("fuzzy");
    expect((firstClause.fuzzy as Record<string, unknown>).maxEdits).toBe(1);
  });

  it("does not include fuzzy config for short terms (< 4 characters)", async () => {
    mockAggregate
      .mockResolvedValueOnce([makeOffer()])
      .mockResolvedValueOnce([{ total: 1 }]);

    await GET(makeRequest({ q: "KFC" })); // 3-char query — no fuzzy

    const pipeline = mockAggregate.mock.calls[0]![0] as unknown[];
    const searchStage = pipeline[0] as Record<string, unknown>;
    const compound = (searchStage["$search"] as Record<string, unknown>)
      .compound as Record<string, unknown>;
    const shouldClauses = compound.should as Array<Record<string, unknown>>;
    const firstClause = shouldClauses[0]!.text as Record<string, unknown>;
    expect(firstClause).not.toHaveProperty("fuzzy");
  });

  // AC4: bank filter alongside text search — $match stage carries the filter
  // TODO: integration test needs real DB to verify combined filter + Atlas Search
  it("passes bank filter via $match stage alongside Atlas Search", async () => {
    mockAggregate
      .mockResolvedValueOnce([makeOffer({ bank: "hnb" })])
      .mockResolvedValueOnce([{ total: 1 }]);

    const res = await GET(makeRequest({ q: "pizza", bank: "hnb" }));
    expect(res.status).toBe(200);

    // The $match stage (second stage) should carry the bank filter
    const pipeline = mockAggregate.mock.calls[0]![0] as unknown[];
    const matchStage = pipeline[1] as Record<string, unknown>;
    expect(matchStage).toHaveProperty("$match");
    expect((matchStage["$match"] as Record<string, unknown>).bank).toBe("hnb");
  });

  // AC6: total count from Atlas Search count pipeline (not countDocuments)
  // TODO: integration test needs real DB to verify Atlas Search count accuracy
  it("returns total from Atlas Search count pipeline when q is provided", async () => {
    mockAggregate
      .mockResolvedValueOnce([makeOffer()])
      .mockResolvedValueOnce([{ total: 42 }]); // Atlas Search reports 42 results

    const res = await GET(makeRequest({ q: "pizza" }));
    const body = await res.json();
    expect(body.pagination.total).toBe(42);
    // countDocuments should NOT be called on the search path
    expect(mockCount).not.toHaveBeenCalled();
  });

  // Stale-index fallback: Atlas Search succeeds but returns 0 results → regex cross-check
  it("falls back to regex when Atlas Search returns 0 results (stale index)", async () => {
    // Atlas Search pipeline returns empty results (stale index)
    mockAggregate
      .mockResolvedValueOnce([])       // searchRaw — empty
      .mockResolvedValueOnce([]);       // countResult — empty (total = 0)

    // Regex fallback returns 1 match
    mockLean.mockResolvedValueOnce([makeOffer()]);
    mockCount.mockResolvedValueOnce(1);

    const res = await GET(makeRequest({ q: "pizza" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    // Should surface the regex result, not the Atlas 0-result response
    expect(body.pagination.total).toBe(1);
    expect(body.data).toHaveLength(1);
    // Regex path: find() called with $or clause
    expect(mockFind).toHaveBeenCalledWith(
      expect.objectContaining({
        $or: expect.arrayContaining([
          expect.objectContaining({ title: expect.any(RegExp) }),
        ]),
      }),
    );
  });

  // Stale-index fallback: Atlas returns 0 AND regex also returns 0 → empty response
  it("returns empty results when both Atlas Search and regex return 0", async () => {
    mockAggregate
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mockLean.mockResolvedValueOnce([]);
    mockCount.mockResolvedValueOnce(0);

    const res = await GET(makeRequest({ q: "xyzzy_nonexistent" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pagination.total).toBe(0);
    expect(body.data).toHaveLength(0);
  });

  // Fallback: any Atlas Search error → falls back to case-insensitive regex search
  it("falls back to regex search when Atlas Search throws any error", async () => {
    const mongoError = Object.assign(new Error("index not found"), {
      name: "MongoServerError",
    });
    mockAggregate.mockRejectedValue(mongoError);

    const res = await GET(makeRequest({ q: "pizza" }));
    expect(res.status).toBe(200);
    // Fallback path uses find() with a regex $or clause (no $text, no Atlas Search).
    // The regex filter is an $or over title / merchant / description.
    expect(mockFind).toHaveBeenCalledWith(
      expect.objectContaining({
        $or: expect.arrayContaining([
          expect.objectContaining({ title: expect.any(RegExp) }),
        ]),
      }),
    );
  });

  // Non-index errors also fall back to regex (not re-thrown as 500)
  it("falls back to regex search when Atlas Search throws a network error", async () => {
    mockAggregate.mockRejectedValue(new Error("network timeout"));

    const res = await GET(makeRequest({ q: "pizza" }));
    // Previously returned 500; now falls back to regex and returns 200.
    expect(res.status).toBe(200);
    expect(mockFind).toHaveBeenCalled();
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

  // Regression: 047 — last page rendered no offers because the isExpired-only
  // filter path used estimatedDocumentCount(), which ignores the filter and
  // counts the whole collection, inflating totalPages past the point the
  // filtered query can actually serve.

  it("last page with total not evenly divisible by limit returns the remaining offers, not an empty array", async () => {
    mockCount.mockResolvedValue(45); // 3 pages of 20: 20, 20, 5
    mockLean.mockResolvedValue([makeOffer(), makeOffer(), makeOffer(), makeOffer(), makeOffer()]);
    const res = await GET(makeRequest({ page: "3", limit: "20" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(5);
    expect(body.pagination).toMatchObject({ page: 3, totalPages: 3, total: 45 });
    expect(mockSkip).toHaveBeenCalledWith(40);
  });

  it("last page with total evenly divisible by limit returns a full page", async () => {
    mockCount.mockResolvedValue(40); // 2 full pages of 20
    mockLean.mockResolvedValue(Array.from({ length: 20 }, () => makeOffer()));
    const res = await GET(makeRequest({ page: "2", limit: "20" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(20);
    expect(body.pagination).toMatchObject({ page: 2, totalPages: 2, total: 40 });
  });

  it("totalPages is Math.ceil(total / limit) for both even and uneven totals", async () => {
    mockCount.mockResolvedValue(41);
    const uneven = await GET(makeRequest({ limit: "20" }));
    expect((await uneven.json()).pagination.totalPages).toBe(3);

    mockCount.mockResolvedValue(40);
    const even = await GET(makeRequest({ limit: "20" }));
    expect((await even.json()).pagination.totalPages).toBe(2);
  });

  it("regression: default isExpired-only filter uses an accurate count so the last page is never past the real data", async () => {
    // Simulate a collection where the whole-collection count (what
    // estimatedDocumentCount() would return) is far larger than the number of
    // non-expired offers actually matching the filter.
    mockEstimatedCount.mockResolvedValue(999);
    mockCount.mockResolvedValue(41);
    mockLean.mockResolvedValue([makeOffer()]); // last page: 41 % 20 = 1 remaining
    const res = await GET(makeRequest({ page: "3", limit: "20" }));
    const body = await res.json();
    expect(mockEstimatedCount).not.toHaveBeenCalled();
    expect(mockCount).toHaveBeenCalledWith(expect.objectContaining({ isExpired: false }));
    expect(body.data).toHaveLength(1);
    expect(body.pagination.totalPages).toBe(3);
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

  // ── estimatedDocumentCount optimisation ──────────────────────────────────
  // estimatedDocumentCount() ignores any filter and counts the whole collection,
  // so it's only accurate when `filter` is truly empty ({}). Any non-empty
  // filter — including the common isExpired-only default — must use
  // countDocuments(filter) for an accurate total (see 047 regression tests above).

  it("uses countDocuments (not estimated) for the default isExpired-only filter", async () => {
    await GET(makeRequest()); // no filters → filter = { isExpired: false }
    expect(mockCount).toHaveBeenCalled();
    expect(mockEstimatedCount).not.toHaveBeenCalled();
  });

  it("uses countDocuments (not estimated) when additional filters are present", async () => {
    await GET(makeRequest({ bank: "hnb" })); // extra filter → needs exact count
    expect(mockCount).toHaveBeenCalled();
    expect(mockEstimatedCount).not.toHaveBeenCalled();
  });

  it("uses estimatedDocumentCount only when the filter is truly empty (includeExpired=true, no other filters)", async () => {
    mockEstimatedCount.mockResolvedValue(45);
    const res = await GET(makeRequest({ includeExpired: "true" })); // filter = {}
    const body = await res.json();
    expect(mockEstimatedCount).toHaveBeenCalled();
    expect(mockCount).not.toHaveBeenCalled();
    expect(body.pagination.total).toBe(45);
  });

  // ── Cache-Control header ──────────────────────────────────────────────────

  it("returns public Cache-Control for default listing (no q, no includeExpired)", async () => {
    const res = await GET(makeRequest());
    expect(res.headers.get("Cache-Control")).toBe(
      "public, s-maxage=60, stale-while-revalidate=300",
    );
  });

  it("returns public Cache-Control for filtered listing (bank filter, no search)", async () => {
    const res = await GET(makeRequest({ bank: "hnb" }));
    expect(res.headers.get("Cache-Control")).toBe(
      "public, s-maxage=60, stale-while-revalidate=300",
    );
  });

  it("returns private Cache-Control when q is present (search results)", async () => {
    mockAggregate
      .mockResolvedValueOnce([makeOffer()])
      .mockResolvedValueOnce([{ total: 1 }]);
    const res = await GET(makeRequest({ q: "pizza" }));
    expect(res.headers.get("Cache-Control")).toBe("private, no-cache");
  });

  it("returns private Cache-Control when includeExpired=true", async () => {
    const res = await GET(makeRequest({ includeExpired: "true" }));
    expect(res.headers.get("Cache-Control")).toBe("private, no-cache");
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
