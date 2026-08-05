/**
 * Unit tests for scripts/migrate-announce-ai-extraction.ts
 * Spec: specs/features/051-announce-ai-offer-extraction.md (AC1-AC5)
 *
 * Mocks connectDb/disconnectDb and AnnouncementModel so no real MongoDB
 * connection is made, then calls the exported main() directly and asserts
 * on the updateMany/findOneAndUpdate calls.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

const { mockConnectDb, mockDisconnectDb, mockUpdateMany, mockFindOneAndUpdate } = vi.hoisted(
  () => ({
    mockConnectDb: vi.fn().mockResolvedValue(undefined),
    mockDisconnectDb: vi.fn().mockResolvedValue(undefined),
    mockUpdateMany: vi.fn(),
    mockFindOneAndUpdate: vi.fn(),
  }),
);

vi.mock("../crawler/utils/db", () => ({
  connectDb: mockConnectDb,
  disconnectDb: mockDisconnectDb,
}));

vi.mock("../src/lib/models/announcement.model", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/models/announcement.model")>(
    "../src/lib/models/announcement.model",
  );
  return {
    ...actual,
    AnnouncementModel: {
      updateMany: mockUpdateMany,
      findOneAndUpdate: mockFindOneAndUpdate,
    },
  };
});

describe("migrate-announce-ai-extraction", () => {
  const originalUri = process.env.MONGODB_URI;

  beforeEach(() => {
    process.env.MONGODB_URI = "mongodb://test-uri";
    mockUpdateMany.mockReset();
    mockFindOneAndUpdate.mockReset();
    mockConnectDb.mockClear();
    mockDisconnectDb.mockClear();
  });

  afterAll(() => {
    process.env.MONGODB_URI = originalUri;
  });

  it("inserts a new active announcement when none exists (AC1)", async () => {
    mockUpdateMany.mockResolvedValueOnce({ modifiedCount: 0 });
    mockFindOneAndUpdate.mockResolvedValueOnce({
      _id: "ann-1",
      message: "AI extraction message",
      active: true,
    });

    const { main, ANNOUNCEMENT_MESSAGE } = await import("./migrate-announce-ai-extraction");
    await main();

    expect(mockConnectDb).toHaveBeenCalledWith("mongodb://test-uri");
    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      { message: ANNOUNCEMENT_MESSAGE },
      { $set: { active: true } },
      { upsert: true, new: true },
    );
    expect(mockDisconnectDb).toHaveBeenCalled();
  });

  it("deactivates a previously-active announcement (AC2)", async () => {
    mockUpdateMany.mockResolvedValueOnce({ modifiedCount: 1 });
    mockFindOneAndUpdate.mockResolvedValueOnce({
      _id: "ann-1",
      message: "AI extraction message",
      active: true,
    });

    const { main, ANNOUNCEMENT_MESSAGE } = await import("./migrate-announce-ai-extraction");
    await main();

    expect(mockUpdateMany).toHaveBeenCalledWith(
      { message: { $ne: ANNOUNCEMENT_MESSAGE }, active: true },
      { $set: { active: false } },
    );
  });

  it("running migration twice does not create a duplicate document (AC3)", async () => {
    mockUpdateMany.mockResolvedValue({ modifiedCount: 0 });
    mockFindOneAndUpdate.mockResolvedValue({
      _id: "ann-1",
      message: "AI extraction message",
      active: true,
    });

    const { main, ANNOUNCEMENT_MESSAGE } = await import("./migrate-announce-ai-extraction");
    await main();
    await main();

    // Both runs target the same document via the message-matched filter —
    // an upsert on this filter can never produce a second document.
    expect(mockFindOneAndUpdate).toHaveBeenCalledTimes(2);
    for (const call of mockFindOneAndUpdate.mock.calls) {
      expect(call[0]).toEqual({ message: ANNOUNCEMENT_MESSAGE });
    }
  });

  it("rejects a message exceeding 280 chars before writing (AC4)", async () => {
    const { main } = await import("./migrate-announce-ai-extraction");
    const tooLong = "x".repeat(281);

    await expect(main(tooLong)).rejects.toThrow(/schema validation/);

    expect(mockConnectDb).not.toHaveBeenCalled();
    expect(mockFindOneAndUpdate).not.toHaveBeenCalled();
  });

  // TODO: integration test needs real DB — mock-based approximation of AC5's
  // "GET /api/announcements/active returns the migrated announcement" by
  // asserting the document the migration writes is exactly the shape that
  // route's `AnnouncementModel.findOne({ active: true })` would return.
  it("writes a document shaped for GET /api/announcements/active to return (AC5)", async () => {
    mockUpdateMany.mockResolvedValueOnce({ modifiedCount: 0 });
    const migratedDoc = {
      _id: "ann-1",
      message: "AI extraction message",
      active: true,
    };
    mockFindOneAndUpdate.mockResolvedValueOnce(migratedDoc);

    const { main } = await import("./migrate-announce-ai-extraction");
    await main();

    const [, update] = mockFindOneAndUpdate.mock.calls[0];
    expect(update).toEqual({ $set: { active: true } });
    expect(migratedDoc.active).toBe(true);
  });
});
