/**
 * Crawler DB utilities — unit tests
 * Spec: specs/features/002-crawler.md (AC3, AC4, AC5)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { OfferInput } from "../../specs/data/offer.schema";

const { mockFindOneAndUpdate, mockUpdateMany } = vi.hoisted(() => ({
  mockFindOneAndUpdate: vi.fn(),
  mockUpdateMany: vi.fn(),
}));

vi.mock("../../src/lib/models/offer.model", () => ({
  OfferModel: {
    findOneAndUpdate: mockFindOneAndUpdate,
    updateMany: mockUpdateMany,
  },
}));

// mongoose mock is needed so db.ts can import it without errors
vi.mock("mongoose", () => ({
  default: {
    connect: vi.fn(),
    disconnect: vi.fn(),
    connection: { db: { databaseName: "test" } },
  },
}));

import { upsertOffers, expireStaleOffers } from "./db";

const MOCK_OFFER: OfferInput = {
  bank: "sampath_bank",
  bankDisplayName: "Sampath Bank",
  title: "Test Dining Offer",
  merchant: "Test Restaurant",
  category: "dining",
  offerType: "percentage",
  discountPercentage: 15,
  discountLabel: "15% off",
  sourceUrl: "https://www.sampath.lk/sampath-cards/credit-card-offer",
  scrapedAt: new Date("2026-04-18"),
};

describe("upsertOffers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("counts as inserted when createdAt ≈ updatedAt (AC3)", async () => {
    const now = new Date();
    mockFindOneAndUpdate.mockResolvedValue({ createdAt: now, updatedAt: now });

    const result = await upsertOffers([MOCK_OFFER]);

    expect(mockFindOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(result.inserted).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.skipped).toBe(0);
  });

  it("counts as updated when createdAt is much earlier than updatedAt (AC4)", async () => {
    const createdAt = new Date("2026-01-01");
    const updatedAt = new Date("2026-04-18");
    mockFindOneAndUpdate.mockResolvedValue({ createdAt, updatedAt });

    const result = await upsertOffers([MOCK_OFFER]);

    expect(result.inserted).toBe(0);
    expect(result.updated).toBe(1);
    expect(result.skipped).toBe(0);
  });

  it("upserts with the correct filter key (bank + merchant + title)", async () => {
    const now = new Date();
    mockFindOneAndUpdate.mockResolvedValue({ createdAt: now, updatedAt: now });

    await upsertOffers([MOCK_OFFER]);

    const [filter] = mockFindOneAndUpdate.mock.calls[0];
    expect(filter.bank).toBe("sampath_bank");
    expect(filter.merchant).toBeDefined();
    expect(filter.title).toBeDefined();
  });

  it("skips an offer and increments skipped when DB throws", async () => {
    mockFindOneAndUpdate.mockRejectedValue(new Error("DB write error"));

    const result = await upsertOffers([MOCK_OFFER]);

    expect(result.inserted).toBe(0);
    expect(result.updated).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it("returns zero counts for an empty offers array", async () => {
    const result = await upsertOffers([]);

    expect(mockFindOneAndUpdate).not.toHaveBeenCalled();
    expect(result).toEqual({ inserted: 0, updated: 0, skipped: 0 });
  });
});

describe("expireStaleOffers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks stale offers as expired and returns count (AC5)", async () => {
    mockUpdateMany.mockResolvedValue({ modifiedCount: 3 });

    const expired = await expireStaleOffers("sampath_bank", [MOCK_OFFER]);

    expect(expired).toBe(3);
    expect(mockUpdateMany).toHaveBeenCalledWith(
      {
        bank: "sampath_bank",
        title: { $nin: ["Test Dining Offer"] },
        isExpired: false,
      },
      { $set: { isExpired: true } }
    );
  });

  it("excludes active offer titles from the expiry filter", async () => {
    mockUpdateMany.mockResolvedValue({ modifiedCount: 0 });
    const secondOffer: OfferInput = { ...MOCK_OFFER, title: "Another Offer" };

    await expireStaleOffers("sampath_bank", [MOCK_OFFER, secondOffer]);

    const [filter] = mockUpdateMany.mock.calls[0];
    expect(filter.title.$nin).toContain("Test Dining Offer");
    expect(filter.title.$nin).toContain("Another Offer");
  });

  it("expires all offers when active list is empty", async () => {
    mockUpdateMany.mockResolvedValue({ modifiedCount: 5 });

    const expired = await expireStaleOffers("sampath_bank", []);

    expect(expired).toBe(5);
    const [filter] = mockUpdateMany.mock.calls[0];
    expect(filter.title.$nin).toHaveLength(0);
  });
});
