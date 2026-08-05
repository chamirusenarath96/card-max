/**
 * Unit tests for scripts/migrate-strip-peoples-bank-see-more.ts
 * Spec: specs/features/050-peoples-bank-see-more-cleanup.md (AC5, AC6)
 *
 * Mocks connectDb/disconnectDb and OfferModel so no real MongoDB connection
 * is made, then calls the exported main() directly and asserts on the
 * countDocuments/find/bulkWrite calls.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

const { mockConnectDb, mockDisconnectDb, mockCountDocuments, mockFind, mockBulkWrite, mockLean } =
  vi.hoisted(() => {
    const mockLean = vi.fn().mockResolvedValue([]);
    const mockSelect = vi.fn(() => ({ lean: mockLean }));
    const mockFind = vi.fn(() => ({ select: mockSelect }));
    return {
      mockConnectDb: vi.fn().mockResolvedValue(undefined),
      mockDisconnectDb: vi.fn().mockResolvedValue(undefined),
      mockCountDocuments: vi.fn(),
      mockFind,
      mockBulkWrite: vi.fn(),
      mockLean,
    };
  });

vi.mock("../crawler/utils/db", () => ({
  connectDb: mockConnectDb,
  disconnectDb: mockDisconnectDb,
}));

vi.mock("../src/lib/models/offer.model", () => ({
  OfferModel: {
    countDocuments: mockCountDocuments,
    find: mockFind,
    bulkWrite: mockBulkWrite,
  },
}));

describe("migrate-strip-peoples-bank-see-more", () => {
  const originalUri = process.env.MONGODB_URI;

  beforeEach(() => {
    process.env.MONGODB_URI = "mongodb://test-uri";
    mockCountDocuments.mockReset();
    mockBulkWrite.mockReset();
    mockLean.mockReset().mockResolvedValue([]);
    mockConnectDb.mockClear();
    mockDisconnectDb.mockClear();
  });

  afterAll(() => {
    process.env.MONGODB_URI = originalUri;
  });

  it("strips trailing chrome fragments from description and discountLabel (AC5)", async () => {
    mockCountDocuments.mockResolvedValueOnce(2);
    mockLean.mockResolvedValueOnce([
      {
        _id: "1",
        bank: "peoples_bank",
        merchant: "Keells",
        title: "30% at Keells",
        description: "30% off on fresh produce ...See more",
        discountLabel: undefined,
      },
      {
        _id: "2",
        bank: "peoples_bank",
        merchant: "Pizza Hut",
        title: "15% at Pizza Hut",
        description: "Dine-in discount. Read more",
        discountLabel: "15% off. View more",
      },
    ]);
    mockBulkWrite.mockResolvedValueOnce({ modifiedCount: 2 });

    const { main } = await import("./migrate-strip-peoples-bank-see-more");
    await main();

    expect(mockConnectDb).toHaveBeenCalledWith("mongodb://test-uri");
    expect(mockCountDocuments).toHaveBeenCalledWith(
      expect.objectContaining({ bank: "peoples_bank" }),
    );
    expect(mockBulkWrite).toHaveBeenCalledWith([
      {
        updateOne: {
          filter: { _id: "1" },
          update: { $set: { description: "30% off on fresh produce" } },
        },
      },
      {
        updateOne: {
          filter: { _id: "2" },
          update: {
            $set: {
              description: "Dine-in discount",
              discountLabel: "15% off",
            },
          },
        },
      },
    ]);
    expect(mockDisconnectDb).toHaveBeenCalled();
  });

  it("is a no-op when 0 documents match (already applied) — AC6 idempotency", async () => {
    mockCountDocuments.mockResolvedValueOnce(0);

    const { main } = await import("./migrate-strip-peoples-bank-see-more");
    await main();

    expect(mockBulkWrite).not.toHaveBeenCalled();
    expect(mockDisconnectDb).toHaveBeenCalled();
  });
});
