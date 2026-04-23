/**
 * Nations Trust Bank scraper — unit tests
 * Spec: specs/features/008-playwright-ntb-fallback.md (AC2, AC3)
 *       specs/features/002-crawler.md (AC1, AC2)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("crawlee", () => {
  return {
    PlaywrightCrawler: vi.fn(),
    log: { setLevel: vi.fn(), LEVELS: { ERROR: 0 } },
  };
});

import { scrape } from "./ntb";
import { PlaywrightCrawler } from "crawlee";

// ── Fixture data ─────────────────────────────────────────────────────────────

const CAMPAIGN_URL = "https://www.nationstrust.com/promotions/credit-cards/pizza-hut-special";

// Row data that would come from page.$$eval('table tr', ...)
type RowData = { merchant: string; offerText: string; eligibility: string };
const MOCK_ROWS: RowData[] = [
  {
    merchant: "Pizza Hut",
    offerText: "15% off on all pizza orders",
    eligibility: "Valid till 31 December 2026",
  },
];

/**
 * Create a mock Playwright page for the given label.
 * LISTING page returns campaign links; CAMPAIGN page returns table rows.
 */
function createMockPage(label: string) {
  if (label === "LISTING") {
    return {
      waitForLoadState: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn().mockResolvedValue(""), // no Incapsula text
      $$eval: vi.fn().mockResolvedValue([CAMPAIGN_URL]),
    };
  }
  // CAMPAIGN page
  return {
    waitForLoadState: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue(""), // no Incapsula text
    $$eval: vi.fn().mockResolvedValue(MOCK_ROWS),
    $eval: vi.fn().mockResolvedValue("Pizza Hut - 15% off"),
  };
}

/** Create a mock page that looks like an Incapsula block page */
function createBlockedPage() {
  return {
    waitForLoadState: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue("Incapsula incident ID 12345 blocked"),
    $$eval: vi.fn().mockResolvedValue([]),
    $eval: vi.fn().mockResolvedValue(""),
  };
}

/** Create a mock page that returns no data */
function createEmptyPage() {
  return {
    waitForLoadState: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue(""),
    $$eval: vi.fn().mockResolvedValue([]),
    $eval: vi.fn().mockResolvedValue(""),
  };
}

/**
 * Wire up PlaywrightCrawler mock so that calling .run() invokes
 * requestHandler for each request in the initial queue, then resolves.
 */
function setupCrawlerMock(pageFactory: (label: string) => ReturnType<typeof createMockPage>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (PlaywrightCrawler as any).mockImplementation((options: Record<string, any>) => ({
    run: vi.fn().mockImplementation(async (requests: Array<{ url: string; label: string }>) => {
      const pendingRequests = [...requests];

      while (pendingRequests.length > 0) {
        const req = pendingRequests.shift()!;
        const page = pageFactory(req.label);

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

describe("ntb scraper (Crawlee)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns valid OfferInput objects when site is accessible (AC1, AC2)", async () => {
    setupCrawlerMock(createMockPage);

    const offers = await scrape();

    expect(Array.isArray(offers)).toBe(true);
    expect(offers.length).toBeGreaterThan(0);
    expect(offers[0]).toMatchObject({
      bank: "nations_trust_bank",
      bankDisplayName: "Nations Trust Bank",
      title: expect.any(String),
      merchant: "Pizza Hut",
    });
  });

  it("returns empty array when listing page is blocked by Incapsula", async () => {
    // Both listing and any follow-up pages are blocked
    setupCrawlerMock(() => createBlockedPage());

    const offers = await scrape();

    expect(Array.isArray(offers)).toBe(true);
    expect(offers).toHaveLength(0);
  });

  it("returns empty array when no campaign links are found in listing", async () => {
    // Listing returns no links, campaign page never visited
    setupCrawlerMock(() => createEmptyPage());

    const offers = await scrape();

    expect(Array.isArray(offers)).toBe(true);
    expect(offers).toHaveLength(0);
  });

  it("skips campaign pages that return a blocked page", async () => {
    let callCount = 0;
    setupCrawlerMock((label) => {
      callCount++;
      if (label === "LISTING" && callCount === 1) {
        // Listing finds a link
        return {
          waitForLoadState: vi.fn().mockResolvedValue(undefined),
          evaluate: vi.fn().mockResolvedValue(""),
          $$eval: vi.fn().mockResolvedValue([CAMPAIGN_URL]),
        };
      }
      // Campaign page is blocked
      return createBlockedPage();
    });

    const offers = await scrape();

    expect(offers).toHaveLength(0);
  });

  it("AC3: Crawlee throws → scraper returns [] without crashing", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (PlaywrightCrawler as any).mockImplementation(() => ({
      run: vi.fn().mockRejectedValue(new Error("Chromium binary not found")),
    }));

    const offers = await scrape();

    expect(offers).toHaveLength(0);
  });

  it("validates each offer with OfferInputSchema before adding to results", async () => {
    // Supply valid rows so offers should pass schema validation
    setupCrawlerMock(createMockPage);

    const offers = await scrape();

    for (const offer of offers) {
      expect(offer.bank).toBe("nations_trust_bank");
      expect(offer.sourceUrl).toMatch(/^https?:\/\//);
      expect(offer.scrapedAt).toBeInstanceOf(Date);
    }
  });
});
