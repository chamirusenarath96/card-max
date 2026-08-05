/**
 * Crawler failure detection and reporting — unit tests
 * Spec: specs/features/052-crawler-failure-monitoring.md
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { detectFailures, reportFailures, EXPECTED_BANKS } from "./failureAlerts";
import type { RunSummary } from "./failureAlerts";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function jsonResponse(body: unknown, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("detectFailures", () => {
  const baseSummaries: RunSummary[] = EXPECTED_BANKS.map((bank) => ({
    bank,
    status: "success",
    scraped: 5,
  }));

  it("returns a kind: error failure for a summary with status: error (AC1)", () => {
    const summaries: RunSummary[] = [
      ...baseSummaries.filter((s) => s.bank !== "hnb"),
      { bank: "hnb", status: "error", error: "Timed out" },
    ];

    const failures = detectFailures(summaries, {});

    expect(failures).toContainEqual({ bank: "hnb", kind: "error", detail: "Timed out" });
  });

  it("returns a kind: zero_offers failure when scraped 0 with a non-zero baseline (AC2)", () => {
    const summaries: RunSummary[] = [
      ...baseSummaries.filter((s) => s.bank !== "sampath_bank"),
      { bank: "sampath_bank", status: "success", scraped: 0 },
    ];

    const failures = detectFailures(summaries, { sampath_bank: 12 });

    expect(failures).toContainEqual({
      bank: "sampath_bank",
      kind: "zero_offers",
      detail: "returned 0 offers; had 12 active offer(s) before this run",
    });
  });

  it("does not report a failure when scraped 0 and baseline was already 0 (AC3)", () => {
    const summaries: RunSummary[] = [
      ...baseSummaries.filter((s) => s.bank !== "sampath_bank"),
      { bank: "sampath_bank", status: "success", scraped: 0 },
    ];

    const failures = detectFailures(summaries, { sampath_bank: 0 });

    expect(failures.find((f) => f.bank === "sampath_bank")).toBeUndefined();
  });

  it("treats an undefined baseline (never scraped before) the same as 0 — no false positive", () => {
    const summaries: RunSummary[] = [
      ...baseSummaries.filter((s) => s.bank !== "sampath_bank"),
      { bank: "sampath_bank", status: "success", scraped: 0 },
    ];

    const failures = detectFailures(summaries, {});

    expect(failures.find((f) => f.bank === "sampath_bank")).toBeUndefined();
  });

  it("returns a kind: missing_from_run failure when a bank is absent from summaries (AC4)", () => {
    const summaries: RunSummary[] = baseSummaries.filter((s) => s.bank !== "bank_of_ceylon");

    const failures = detectFailures(summaries, {});

    expect(failures).toContainEqual({
      bank: "bank_of_ceylon",
      kind: "missing_from_run",
      detail: "absent from this run's SCRAPERS results",
    });
  });

  it("returns no failures for a fully healthy run", () => {
    const failures = detectFailures(baseSummaries, {});
    expect(failures).toEqual([]);
  });
});

describe("reportFailures", () => {
  const failure = { bank: "hnb", kind: "error" as const, detail: "Timed out" };

  it("does not call fetch when GITHUB_FEEDBACK_TOKEN is unset (AC7)", async () => {
    vi.stubEnv("GITHUB_FEEDBACK_TOKEN", "");

    await reportFailures([failure]);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("skips creating an issue when an open issue already exists (AC5)", async () => {
    vi.stubEnv("GITHUB_FEEDBACK_TOKEN", "test-token");
    mockFetch.mockResolvedValueOnce(jsonResponse({ total_count: 1 }));

    await reportFailures([failure]);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("search/issues");
  });

  it("creates an issue with the correct title and labels when no open issue exists (AC6)", async () => {
    vi.stubEnv("GITHUB_FEEDBACK_TOKEN", "test-token");
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ total_count: 0 }))
      .mockResolvedValueOnce(jsonResponse({ number: 1, html_url: "https://example.com/1" }));

    await reportFailures([failure]);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    const [url, options] = mockFetch.mock.calls[1];
    expect(url).toContain("/issues");
    expect(options.method).toBe("POST");
    const body = JSON.parse(options.body);
    expect(body.title).toBe("crawler: hnb scraper failed");
    expect(body.labels).toEqual(["bug", "crawler"]);
  });

  it("logs a warning and continues processing remaining failures when fetch rejects (AC8)", async () => {
    vi.stubEnv("GITHUB_FEEDBACK_TOKEN", "test-token");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const secondFailure = { bank: "sampath_bank", kind: "error" as const, detail: "Boom" };

    mockFetch
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValueOnce(jsonResponse({ total_count: 0 }))
      .mockResolvedValueOnce(jsonResponse({ number: 2, html_url: "https://example.com/2" }));

    await reportFailures([failure, secondFailure]);

    expect(warnSpy).toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledTimes(3);
    warnSpy.mockRestore();
  });
});
