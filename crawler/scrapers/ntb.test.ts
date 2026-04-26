/**
 * Nations Trust Bank scraper — unit tests
 * Spec: specs/features/008-playwright-ntb-fallback.md (AC2, AC3)
 *       specs/features/002-crawler.md (AC1, AC2)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../utils/http", () => ({
  fetchHtmlSessioned: vi.fn(),
  sleep: vi.fn().mockResolvedValue(undefined),
}));

import { scrape } from "./ntb";
import { fetchHtmlSessioned } from "../utils/http";

// ── Fixture HTML ─────────────────────────────────────────────────────────────

const CAMPAIGN_URL =
  "https://www.nationstrust.com/promotions/what-s-new/enjoy-exclusive-savings-on-dining";

/** Listing page HTML with one campaign link */
const LISTING_HTML = `
<html><body>
<a href="${CAMPAIGN_URL}">Dining Offers</a>
</body></html>
`;

/** Campaign page HTML with one active table row (commented rows excluded) */
const CAMPAIGN_HTML = `
<html><body>
<table class="table">
<tbody>
<tr><td>Merchant</td><td>Offer</td><td>Eligibility</td></tr>
<!--<tr><td>Expired Place</td><td>Old offer</td><td>Expired</td></tr>-->
<tr>
  <td><p>Pizza Hut</p></td>
  <td><p>15% off on all pizza orders</p></td>
  <td><p>Valid till 31st December 2026</p></td>
</tr>
</tbody>
</table>
</body></html>
`;

/** Incapsula block page */
const BLOCK_HTML = `<html><body>Incapsula incident ID 12345</body></html>`;

// ── Tests ────────────────────────────────────────────────────────────────────

describe("ntb scraper (HTTP)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns valid OfferInput objects when site is accessible (AC1, AC2)", async () => {
    vi.mocked(fetchHtmlSessioned)
      .mockResolvedValueOnce(LISTING_HTML)
      .mockResolvedValueOnce(CAMPAIGN_HTML);

    const offers = await scrape();

    expect(Array.isArray(offers)).toBe(true);
    expect(offers.length).toBeGreaterThan(0);
    expect(offers[0]).toMatchObject({
      bank: "nations_trust_bank",
      bankDisplayName: "Nations Trust Bank",
      merchant: "Pizza Hut",
      sourceUrl: CAMPAIGN_URL,
    });
  });

  it("returns empty array when listing page is blocked by Incapsula", async () => {
    vi.mocked(fetchHtmlSessioned).mockResolvedValue(BLOCK_HTML);

    const offers = await scrape();

    expect(Array.isArray(offers)).toBe(true);
    expect(offers).toHaveLength(0);
  });

  it("returns empty array when no campaign links are found in listing", async () => {
    vi.mocked(fetchHtmlSessioned).mockResolvedValue("<html><body>No links here</body></html>");

    const offers = await scrape();

    expect(Array.isArray(offers)).toBe(true);
    expect(offers).toHaveLength(0);
  });

  it("skips a campaign page that is blocked", async () => {
    vi.mocked(fetchHtmlSessioned)
      .mockResolvedValueOnce(LISTING_HTML)
      .mockResolvedValueOnce(BLOCK_HTML);

    const offers = await scrape();

    expect(offers).toHaveLength(0);
  });

  it("AC3: HTTP throws → scraper returns [] without crashing", async () => {
    vi.mocked(fetchHtmlSessioned).mockRejectedValue(new Error("Network error"));

    const offers = await scrape();

    expect(offers).toHaveLength(0);
  });

  it("excludes commented-out rows from table parsing", async () => {
    const htmlWithComments = `
      <html><body>
      <a href="${CAMPAIGN_URL}">Link</a>
      </body></html>
    `;
    const campaignWithCommented = `
      <html><body><table>
      <tr><td>Merchant</td><td>Offer</td><td>Eligibility</td></tr>
      <!--<tr><td>Commented Out</td><td>Should not appear</td><td></td></tr>-->
      <tr><td>Active Place</td><td>10% off</td><td>Valid till 31st December 2026</td></tr>
      </table></body></html>
    `;

    vi.mocked(fetchHtmlSessioned)
      .mockResolvedValueOnce(htmlWithComments)
      .mockResolvedValueOnce(campaignWithCommented);

    const offers = await scrape();

    expect(offers.every((o) => o.merchant !== "Commented Out")).toBe(true);
    expect(offers.length).toBeGreaterThan(0);
  });

  it("validates each offer with OfferInputSchema before adding to results", async () => {
    vi.mocked(fetchHtmlSessioned)
      .mockResolvedValueOnce(LISTING_HTML)
      .mockResolvedValueOnce(CAMPAIGN_HTML);

    const offers = await scrape();

    for (const offer of offers) {
      expect(offer.bank).toBe("nations_trust_bank");
      expect(offer.sourceUrl).toMatch(/^https?:\/\//);
      expect(offer.scrapedAt).toBeInstanceOf(Date);
    }
  });
});
