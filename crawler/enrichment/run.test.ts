/**
 * Enrichment run pipeline — unit tests
 * Spec: specs/features/044-ai-offer-enrichment.md (AC4, AC6, Edge Cases)
 */
import { describe, it, expect, vi, afterEach } from "vitest";

function mockOffer(overrides: Partial<{ _id: string; title: string }> = {}) {
  return {
    _id: overrides._id ?? "offer-1",
    title: overrides.title ?? "Test Offer",
    description: "Every Thursday.",
    merchant: "Test Merchant",
    category: "dining",
    sourceUrl: "https://bank.lk/offers/test",
    validFrom: new Date(2026, 0, 1),
    validUntil: new Date(2026, 11, 31),
  };
}

describe("enrichment run pipeline", () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    delete process.env.MONGODB_URI;
    delete process.env.GEMINI_API_KEY;
  });

  it("exits 1 without connecting when MONGODB_URI is missing", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const connectMock = vi.fn();

    vi.doMock("dotenv", () => ({ default: { config: vi.fn() }, config: vi.fn() }));
    vi.doMock("mongoose", () => ({
      default: { connect: connectMock, disconnect: vi.fn() },
    }));
    vi.doMock("../../src/lib/models/offer.model", () => ({
      OfferModel: { find: vi.fn(), updateOne: vi.fn() },
    }));
    vi.doMock("./enrichOffer", () => ({ enrichOffer: vi.fn() }));

    await import("./run");

    await vi.waitFor(() => expect(exitSpy).toHaveBeenCalled());
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("exits 1 without connecting when GEMINI_API_KEY is missing", async () => {
    process.env.MONGODB_URI = "mongodb://localhost:27017/test";
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const connectMock = vi.fn();

    vi.doMock("dotenv", () => ({ default: { config: vi.fn() }, config: vi.fn() }));
    vi.doMock("mongoose", () => ({
      default: { connect: connectMock, disconnect: vi.fn() },
    }));
    vi.doMock("../../src/lib/models/offer.model", () => ({
      OfferModel: { find: vi.fn(), updateOne: vi.fn() },
    }));
    vi.doMock("./enrichOffer", () => ({ enrichOffer: vi.fn() }));

    await import("./run");

    await vi.waitFor(() => expect(exitSpy).toHaveBeenCalled());
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("enriches pending/failed offers, patches them, and exits 0 even with per-offer failures (AC4)", async () => {
    process.env.MONGODB_URI = "mongodb://localhost:27017/test";
    process.env.GEMINI_API_KEY = "test-key";

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const offers = [mockOffer({ _id: "a" }), mockOffer({ _id: "b" })];
    const findMock = vi.fn().mockReturnValue({ lean: () => Promise.resolve(offers) });
    const updateOneMock = vi.fn().mockResolvedValue(undefined);
    const enrichOfferMock = vi
      .fn()
      .mockResolvedValueOnce({ semanticSummary: "A deal.", enrichmentStatus: "done" })
      .mockResolvedValueOnce({ enrichmentStatus: "failed" });

    vi.doMock("dotenv", () => ({ default: { config: vi.fn() }, config: vi.fn() }));
    vi.doMock("mongoose", () => ({
      default: { connect: vi.fn().mockResolvedValue(undefined), disconnect: vi.fn().mockResolvedValue(undefined) },
    }));
    vi.doMock("../../src/lib/models/offer.model", () => ({
      OfferModel: { find: findMock, updateOne: updateOneMock },
    }));
    vi.doMock("./enrichOffer", () => ({ enrichOffer: enrichOfferMock }));

    await import("./run");

    await vi.waitFor(() => expect(exitSpy).toHaveBeenCalled());

    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(findMock).toHaveBeenCalledWith({ enrichmentStatus: { $in: ["pending", "failed"] } });
    expect(updateOneMock).toHaveBeenCalledTimes(2);
    expect(updateOneMock).toHaveBeenCalledWith(
      { _id: "a" },
      { $set: { semanticSummary: "A deal.", enrichmentStatus: "done" } }
    );
    expect(updateOneMock).toHaveBeenCalledWith({ _id: "b" }, { $set: { enrichmentStatus: "failed" } });

    const summaryCall = logSpy.mock.calls.find(
      (args) => typeof args[0] === "string" && args[0].includes("\"done\"")
    );
    expect(summaryCall).toBeDefined();
    const summary = JSON.parse(summaryCall![0] as string);
    expect(summary.total).toBe(2);
    expect(summary.done).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.haltedEarly).toBe(false);
  });

  it("halts early after consecutive failures instead of failing the whole run (Edge Cases: rate limits)", async () => {
    process.env.MONGODB_URI = "mongodb://localhost:27017/test";
    process.env.GEMINI_API_KEY = "test-key";

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const offers = Array.from({ length: 8 }, (_, i) => mockOffer({ _id: `offer-${i}` }));
    const findMock = vi.fn().mockReturnValue({ lean: () => Promise.resolve(offers) });
    const updateOneMock = vi.fn().mockResolvedValue(undefined);
    const enrichOfferMock = vi.fn().mockResolvedValue({ enrichmentStatus: "failed" });

    vi.doMock("dotenv", () => ({ default: { config: vi.fn() }, config: vi.fn() }));
    vi.doMock("mongoose", () => ({
      default: { connect: vi.fn().mockResolvedValue(undefined), disconnect: vi.fn().mockResolvedValue(undefined) },
    }));
    vi.doMock("../../src/lib/models/offer.model", () => ({
      OfferModel: { find: findMock, updateOne: updateOneMock },
    }));
    vi.doMock("./enrichOffer", () => ({ enrichOffer: enrichOfferMock }));

    await import("./run");

    await vi.waitFor(() => expect(exitSpy).toHaveBeenCalled());

    expect(exitSpy).toHaveBeenCalledWith(0);

    const summaryCall = logSpy.mock.calls.find(
      (args) => typeof args[0] === "string" && args[0].includes("haltedEarly")
    );
    const summary = JSON.parse(summaryCall![0] as string);

    expect(summary.haltedEarly).toBe(true);
    expect(summary.done).toBe(0);
    // Not every offer was processed — the run stopped short of the full 8.
    expect(enrichOfferMock.mock.calls.length).toBeLessThan(8);
  });
});
