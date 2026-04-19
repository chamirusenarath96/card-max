/**
 * Nations Trust Bank scraper — unit tests
 * Spec: specs/features/008-playwright-ntb-fallback.md (AC2, AC3)
 *       specs/features/002-crawler.md (AC1, AC2)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../utils/http", () => ({
  fetchHtmlSessioned: vi.fn(),
  pLimit: (tasks: Array<() => Promise<unknown>>, _n: number) =>
    Promise.all(tasks.map((t) => t())),
  sleep: vi.fn(),
}));

vi.mock("playwright", () => ({
  chromium: {
    launch: vi.fn(),
  },
}));

import { scrape } from "./ntb";
import { fetchHtmlSessioned } from "../utils/http";
import { chromium } from "playwright";

// Listing HTML with a valid campaign link (both path segments ≥ 5 chars)
const LISTING_HTML = `
<html><body>
  <a href="/promotions/credit-cards/pizza-hut-special-offer">Pizza Hut</a>
</body></html>
`;

// Campaign page with an offer table
const CAMPAIGN_HTML = `
<html><body>
<table>
<tr><th>Merchant</th><th>Offer Details</th><th>Eligibility</th></tr>
<tr><td>Pizza Hut</td><td>15% off on all pizza orders</td><td>Valid till 31 December 2026</td></tr>
</table>
</body></html>
`;

// Incapsula block page
const BLOCK_HTML = `<html><body>Incapsula incident ID: 12345</body></html>`;

/** Set up a Playwright browser mock that serves the given HTML */
function mockPlaywrightPage(html: string) {
  const mockPage = {
    goto: vi.fn(),
    waitForSelector: vi.fn(),
    content: vi.fn().mockResolvedValue(html),
  };
  const mockBrowser = {
    newPage: vi.fn().mockResolvedValue(mockPage),
    close: vi.fn(),
  };
  vi.mocked(chromium.launch).mockResolvedValue(mockBrowser as never);
}

describe("ntb scraper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns valid OfferInput objects when site is accessible (AC1, AC2)", async () => {
    vi.mocked(fetchHtmlSessioned)
      .mockResolvedValueOnce("<html></html>")  // HOME warm-up
      .mockResolvedValueOnce(LISTING_HTML)     // listing page 0
      .mockResolvedValueOnce("<html></html>")  // listing page 1 (no extra links)
      .mockResolvedValueOnce(CAMPAIGN_HTML);   // campaign page

    const offers = await scrape();

    expect(Array.isArray(offers)).toBe(true);
    expect(offers.length).toBeGreaterThan(0);
    expect(offers[0]).toMatchObject({
      bank: "nations_trust_bank",
      bankDisplayName: "Nations Trust Bank",
      title: expect.any(String),
      merchant: expect.any(String),
    });
  });

  it("returns empty array when all listing pages are blocked", async () => {
    // HTTP blocked → Playwright triggered but returns empty page (no table)
    vi.mocked(fetchHtmlSessioned).mockResolvedValue(BLOCK_HTML);
    mockPlaywrightPage("<html><body>No offers</body></html>");

    const offers = await scrape();

    expect(offers).toHaveLength(0);
  });

  it("returns empty array when no campaign links are found in listing", async () => {
    // Listing pages return HTML but no /promotions/X/Y links → campaign URLs = []
    // → falls back to Playwright which returns empty page
    vi.mocked(fetchHtmlSessioned)
      .mockResolvedValueOnce("<html></html>")
      .mockResolvedValue("<html><body>No links</body></html>");
    mockPlaywrightPage("<html><body>No offers</body></html>");

    const offers = await scrape();

    expect(offers).toHaveLength(0);
  });

  it("skips campaign pages that return a block page", async () => {
    // Listing page succeeds (finds campaign link), but campaign page is blocked
    // → HTTP path finds campaign URLs but all are blocked → 0 offers returned
    // → does NOT fall back to Playwright (campaign URLs were found via HTTP)
    vi.mocked(fetchHtmlSessioned)
      .mockResolvedValueOnce("<html></html>")  // HOME warm-up
      .mockResolvedValueOnce(LISTING_HTML)     // listing page 0 (found link)
      .mockResolvedValueOnce("<html></html>")  // listing page 1
      .mockResolvedValueOnce(BLOCK_HTML);      // campaign page is blocked

    const offers = await scrape();

    expect(offers).toHaveLength(0);
  });

  it("continues when HOME warm-up fails", async () => {
    vi.mocked(fetchHtmlSessioned)
      .mockRejectedValueOnce(new Error("Connection refused")) // HOME warm-up fails
      .mockResolvedValueOnce(LISTING_HTML)                   // listing page 0
      .mockResolvedValueOnce("<html></html>")                // listing page 1
      .mockResolvedValueOnce(CAMPAIGN_HTML);                 // campaign page

    const offers = await scrape();

    expect(Array.isArray(offers)).toBe(true);
  });

  // --- Playwright fallback tests (spec 008 AC2, AC3) ---

  it("AC2: Playwright renders table HTML and parser extracts offers", async () => {
    // All HTTP listing pages blocked → Playwright fallback triggered
    vi.mocked(fetchHtmlSessioned).mockResolvedValue(BLOCK_HTML);
    mockPlaywrightPage(CAMPAIGN_HTML);

    const offers = await scrape();

    expect(offers.length).toBeGreaterThan(0);
    expect(offers[0]).toMatchObject({
      bank: "nations_trust_bank",
      bankDisplayName: "Nations Trust Bank",
      title: expect.any(String),
      merchant: "Pizza Hut",
    });
  });

  it("AC3: Playwright throws → scraper returns [] without crashing", async () => {
    // All HTTP listing pages blocked → Playwright triggered, but Chromium errors
    vi.mocked(fetchHtmlSessioned).mockResolvedValue(BLOCK_HTML);
    vi.mocked(chromium.launch).mockRejectedValue(new Error("Chromium binary not found"));

    const offers = await scrape();

    expect(offers).toHaveLength(0);
  });
});
