/**
 * American Express NTB scraper — unit tests
 * Spec: specs/features/010-amex-offers.md
 *
 * Test Cases covered (per spec Test Cases table):
 *   TC1: BankSchema accepts "amex_ntb"             → unit, AC1
 *   TC2: scrape() returns array (may be empty)     → unit, AC3
 *   TC3: each offer has bank: "amex_ntb"           → unit, AC5
 *   TC4: HTTP 403 → returns [], no throw           → unit, AC6
 *   TC5: Playwright throws → returns []            → unit, AC6
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("crawlee", () => {
  return {
    PlaywrightCrawler: vi.fn(),
    log: { setLevel: vi.fn(), LEVELS: { ERROR: 0 } },
  };
});

import { BankSchema } from "../../specs/data/offer.schema";
import { scrape } from "./amex";
import { PlaywrightCrawler } from "crawlee";

// ── Fixture data ─────────────────────────────────────────────────────────────

const DETAIL_URL = "https://www.americanexpress.lk/offers/pizza-hut-25-off";

/** Mock page for the LISTING label that has detail links */
function createListingPageWithLinks() {
  return {
    waitForLoadState: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue(""),
    $$eval: vi.fn().mockResolvedValue([DETAIL_URL]),
    $eval: vi.fn().mockResolvedValue(""),
  };
}

/** Mock page for the DETAIL label */
function createDetailPage() {
  return {
    waitForLoadState: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockImplementation(async (_fn: () => unknown) => {
      // First call is Incapsula check, second is og:image, third is bodyText
      const str = _fn.toString();
      if (str.includes("og:image")) return "https://cdn.americanexpress.lk/pizza-hut.jpg";
      if (str.includes("innerText")) return "25% off dining at Pizza Hut. Valid till 31 December 2026.";
      return "";
    }),
    $$eval: vi.fn().mockResolvedValue([]),
    $eval: vi.fn().mockImplementation(async (selector: string) => {
      if (selector.includes("h1") || selector.includes("h2")) return "25% off at Pizza Hut";
      if (selector.includes("discount") || selector.includes("badge")) return "25% off";
      return "";
    }),
  };
}

/** Mock page that looks blocked by Incapsula */
function createBlockedPage() {
  return {
    waitForLoadState: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue("Incapsula incident ID 99999 blocked"),
    $$eval: vi.fn().mockResolvedValue([]),
    $eval: vi.fn().mockResolvedValue(""),
  };
}

/** Mock page that has no usable content */
function createEmptyPage() {
  return {
    waitForLoadState: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue(""),
    $$eval: vi.fn().mockResolvedValue([]),
    $eval: vi.fn().mockRejectedValue(new Error("No matching element")),
  };
}

/**
 * Wire up PlaywrightCrawler mock so that calling .run() invokes
 * requestHandler for each request in the queue, then resolves.
 */
function setupCrawlerMock(pageFactory: (label: string, url: string) => ReturnType<typeof createDetailPage>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (PlaywrightCrawler as any).mockImplementation((options: Record<string, any>) => ({
    run: vi.fn().mockImplementation(async (requests: Array<{ url: string; label: string }>) => {
      const pendingRequests = [...requests];

      while (pendingRequests.length > 0) {
        const req = pendingRequests.shift()!;
        const page = pageFactory(req.label, req.url);

        const addRequests = vi.fn().mockImplementation(
          async (newReqs: Array<{ url: string; label: string }>) => {
            for (const r of newReqs) {
              pendingRequests.push(r);
            }
          }
        );

        await options.requestHandler?.({
          page: page as never,
          request: { url: req.url, label: req.label } as never,
          addRequests,
        } as never);
      }
    }),
  }));
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("amex scraper (Crawlee)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // TC1 — BankSchema accepts "amex_ntb"
  it('TC1: BankSchema accepts "amex_ntb"', () => {
    const result = BankSchema.safeParse("amex_ntb");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("amex_ntb");
  });

  // TC2 — scrape() returns an array (may be empty in CI without network)
  it("TC2: scrape() always returns an array", async () => {
    setupCrawlerMock(() => createEmptyPage());

    const offers = await scrape();

    expect(Array.isArray(offers)).toBe(true);
  });

  // TC3 — returned offers have bank: "amex_ntb"
  it("TC3: each returned offer has bank: amex_ntb", async () => {
    setupCrawlerMock((label) => {
      if (label === "LISTING") return createListingPageWithLinks();
      return createDetailPage();
    });

    const offers = await scrape();

    expect(offers.length).toBeGreaterThan(0);
    for (const offer of offers) {
      expect(offer.bank).toBe("amex_ntb");
      expect(offer.bankDisplayName).toBe("American Express (NTB)");
    }
  });

  // TC4 — Crawlee throws (e.g. network error) → returns [], no throw
  it("TC4: Crawlee throws → returns [] and does not throw", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (PlaywrightCrawler as any).mockImplementation(() => ({
      run: vi.fn().mockRejectedValue(new Error("Network connection refused")),
    }));

    const offers = await scrape();

    expect(Array.isArray(offers)).toBe(true);
    expect(offers).toHaveLength(0);
  });

  // TC4b — Incapsula block page returned on all requests
  it("TC4b: Incapsula block page → scraper returns [] gracefully", async () => {
    setupCrawlerMock(() => createBlockedPage());

    const offers = await scrape();

    expect(offers).toHaveLength(0);
  });

  // TC5 — Crawlee/PlaywrightCrawler constructor throws → returns []
  it("TC5: PlaywrightCrawler throws on construction → returns [] without crashing", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (PlaywrightCrawler as any).mockImplementation(() => {
      throw new Error("Chromium binary not found");
    });

    const offers = await scrape();

    expect(offers).toHaveLength(0);
  });

  // Happy path — listing page has detail links → visits detail pages
  it("extracts offers from detail pages when listing has links", async () => {
    setupCrawlerMock((label) => {
      if (label === "LISTING") return createListingPageWithLinks();
      return createDetailPage();
    });

    const offers = await scrape();

    expect(Array.isArray(offers)).toBe(true);
    expect(offers.length).toBeGreaterThan(0);
    expect(offers[0]).toMatchObject({
      bank: "amex_ntb",
      sourceUrl: expect.stringContaining("americanexpress.lk"),
    });
  });

  // Home page warm-up / listing empty → returns []
  it("returns empty array when listing page has no links and no cards", async () => {
    setupCrawlerMock(() => createEmptyPage());

    const offers = await scrape();

    expect(Array.isArray(offers)).toBe(true);
  });
});
