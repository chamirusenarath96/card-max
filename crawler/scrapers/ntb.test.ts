/**
 * Nations Trust Bank scraper — unit tests
 * Spec: specs/features/002-crawler.md (AC1, AC2)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../utils/http", () => ({
  fetchHtmlSessioned: vi.fn(),
  pLimit: (tasks: Array<() => Promise<unknown>>, _n: number) =>
    Promise.all(tasks.map((t) => t())),
  sleep: vi.fn(),
}));

import { scrape } from "./ntb";
import { fetchHtmlSessioned } from "../utils/http";

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
    vi.mocked(fetchHtmlSessioned).mockResolvedValue(BLOCK_HTML);

    const offers = await scrape();

    expect(offers).toHaveLength(0);
  });

  it("returns empty array when no campaign links are found in listing", async () => {
    vi.mocked(fetchHtmlSessioned)
      .mockResolvedValueOnce("<html></html>")           // HOME warm-up
      .mockResolvedValue("<html><body>No links</body></html>"); // listing pages (no /promotions/... links)

    const offers = await scrape();

    expect(offers).toHaveLength(0);
  });

  it("skips campaign pages that return a block page", async () => {
    vi.mocked(fetchHtmlSessioned)
      .mockResolvedValueOnce("<html></html>")  // HOME warm-up
      .mockResolvedValueOnce(LISTING_HTML)     // listing page 0
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

    // Scraper should still work even without session cookies
    expect(Array.isArray(offers)).toBe(true);
  });
});
