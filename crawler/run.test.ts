/**
 * Crawler run pipeline — unit tests
 * Spec: specs/features/002-crawler.md (AC6, AC7, AC8)
 *
 * Tests that Promise.allSettled isolation means one failing scraper does not
 * prevent the others from running, and that the JSON summary is logged.
 */
import { describe, it, expect, vi, afterEach } from "vitest";

describe("crawler run pipeline", () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    delete process.env.MONGODB_URI;
  });

  it("continues running other scrapers when one fails (AC6)", async () => {
    process.env.MONGODB_URI = "mongodb://localhost:27017/test";

    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
    const logSpy = vi
      .spyOn(console, "log")
      .mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const upsertMock = vi
      .fn()
      .mockResolvedValue({ inserted: 0, updated: 0, skipped: 0 });
    const expireMock = vi.fn().mockResolvedValue(0);

    vi.doMock("dotenv", () => ({
      default: { config: vi.fn() },
      config: vi.fn(),
    }));

    vi.doMock("./utils/db", () => ({
      connectDb: vi.fn().mockResolvedValue(undefined),
      disconnectDb: vi.fn().mockResolvedValue(undefined),
      upsertOffers: upsertMock,
      expireStaleOffers: expireMock,
    }));

    vi.doMock("./scrapers/combank", () => ({
      scrape: vi.fn().mockRejectedValue(new Error("combank network error")),
    }));
    vi.doMock("./scrapers/sampath", () => ({
      scrape: vi.fn().mockResolvedValue([]),
    }));
    vi.doMock("./scrapers/hnb", () => ({
      scrape: vi.fn().mockResolvedValue([]),
    }));
    vi.doMock("./scrapers/ntb", () => ({
      scrape: vi.fn().mockResolvedValue([]),
    }));

    // Dynamic import triggers main() which runs the pipeline
    await import("./run");

    // Wait for main() to call process.exit (mocked async ops resolve instantly)
    await vi.waitFor(
      () => {
        expect(exitSpy).toHaveBeenCalled();
      },
      { timeout: 5000 }
    );

    // exit(1) because combank failed (hasError=true)
    expect(exitSpy).toHaveBeenCalledWith(1);

    // sampath, hnb, ntb each ran their upsert (3 calls with empty arrays)
    expect(upsertMock).toHaveBeenCalledTimes(3);

    // Structured JSON summary was logged to stdout (AC8)
    const summaryCall = logSpy.mock.calls.find(
      (args) => typeof args[0] === "string" && args[0].includes("summaries")
    );
    expect(summaryCall).toBeDefined();
    const summary = JSON.parse(summaryCall![0] as string);
    expect(summary.errors).toBe(1);
    expect(summary.summaries).toHaveLength(4);

    const combankEntry = summary.summaries.find(
      (s: { bank: string }) => s.bank === "commercial_bank"
    );
    const sampathEntry = summary.summaries.find(
      (s: { bank: string }) => s.bank === "sampath_bank"
    );
    expect(combankEntry.status).toBe("error");
    expect(sampathEntry.status).toBe("success");
  });

  it("exits with 0 when all scrapers succeed (AC7)", async () => {
    process.env.MONGODB_URI = "mongodb://localhost:27017/test";

    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    vi.doMock("dotenv", () => ({
      default: { config: vi.fn() },
      config: vi.fn(),
    }));
    vi.doMock("./utils/db", () => ({
      connectDb: vi.fn().mockResolvedValue(undefined),
      disconnectDb: vi.fn().mockResolvedValue(undefined),
      upsertOffers: vi.fn().mockResolvedValue({ inserted: 1, updated: 0, skipped: 0 }),
      expireStaleOffers: vi.fn().mockResolvedValue(0),
    }));
    vi.doMock("./scrapers/combank", () => ({
      scrape: vi.fn().mockResolvedValue([]),
    }));
    vi.doMock("./scrapers/sampath", () => ({
      scrape: vi.fn().mockResolvedValue([]),
    }));
    vi.doMock("./scrapers/hnb", () => ({
      scrape: vi.fn().mockResolvedValue([]),
    }));
    vi.doMock("./scrapers/ntb", () => ({
      scrape: vi.fn().mockResolvedValue([]),
    }));

    await import("./run");

    await vi.waitFor(
      () => {
        expect(exitSpy).toHaveBeenCalled();
      },
      { timeout: 5000 }
    );

    expect(exitSpy).toHaveBeenCalledWith(0);
  });
});
