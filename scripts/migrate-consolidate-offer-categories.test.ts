/**
 * Unit tests for scripts/migrate-consolidate-offer-categories.ts
 * Spec: specs/features/048-consolidate-offer-categories.md (AC3)
 *
 * Mocks connectDb/disconnectDb and OfferModel so no real MongoDB connection
 * is made, then calls the exported main() directly and asserts on the
 * countDocuments/updateMany calls.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

const { mockConnectDb, mockDisconnectDb, mockCountDocuments, mockFind, mockUpdateMany, mockLean } =
  vi.hoisted(() => {
    const mockLean = vi.fn().mockResolvedValue([]);
    const mockSelect = vi.fn(() => ({ lean: mockLean }));
    const mockLimit = vi.fn(() => ({ select: mockSelect }));
    const mockFind = vi.fn(() => ({ limit: mockLimit }));
    return {
      mockConnectDb: vi.fn().mockResolvedValue(undefined),
      mockDisconnectDb: vi.fn().mockResolvedValue(undefined),
      mockCountDocuments: vi.fn(),
      mockFind,
      mockUpdateMany: vi.fn(),
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
    updateMany: mockUpdateMany,
  },
}));

describe("migrate-consolidate-offer-categories", () => {
  const originalUri = process.env.MONGODB_URI;

  beforeEach(() => {
    process.env.MONGODB_URI = "mongodb://test-uri";
    mockCountDocuments.mockReset();
    mockUpdateMany.mockReset();
    mockLean.mockReset().mockResolvedValue([]);
    mockConnectDb.mockClear();
    mockDisconnectDb.mockClear();
  });

  afterAll(() => {
    process.env.MONGODB_URI = originalUri;
  });

  it("updates matching lodging and clothing documents to their mapped category", async () => {
    mockCountDocuments.mockResolvedValueOnce(3).mockResolvedValueOnce(2);
    mockUpdateMany
      .mockResolvedValueOnce({ modifiedCount: 3 })
      .mockResolvedValueOnce({ modifiedCount: 2 });

    const { main } = await import("./migrate-consolidate-offer-categories");
    await main();

    expect(mockConnectDb).toHaveBeenCalledWith("mongodb://test-uri");
    expect(mockCountDocuments).toHaveBeenCalledWith({ category: "lodging" });
    expect(mockCountDocuments).toHaveBeenCalledWith({ category: "clothing" });
    expect(mockUpdateMany).toHaveBeenCalledWith(
      { category: "lodging" },
      { $set: { category: "travel" } },
    );
    expect(mockUpdateMany).toHaveBeenCalledWith(
      { category: "clothing" },
      { $set: { category: "shopping" } },
    );
    expect(mockDisconnectDb).toHaveBeenCalled();
  });

  it("is a no-op when 0 documents match (already applied)", async () => {
    mockCountDocuments.mockResolvedValueOnce(0).mockResolvedValueOnce(0);

    const { main } = await import("./migrate-consolidate-offer-categories");
    await main();

    expect(mockUpdateMany).not.toHaveBeenCalled();
    expect(mockDisconnectDb).toHaveBeenCalled();
  });
});
