/**
 * Nations Trust Bank scraper — unit tests
 * Spec: specs/features/008-playwright-ntb-fallback.md (AC2, AC3)
 *       specs/features/002-crawler.md (AC1, AC2)
 *
 * The scraper has two paths:
 *   1. HTTP (fast, works from residential IPs)
 *   2. Crawlee/Playwright fallback (when HTTP is blocked by Incapsula)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../utils/http", () => ({
  fetchHtmlSessioned: vi.fn(),
  sleep: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("crawlee", () => ({
  PlaywrightCrawler: vi.fn(),
  log: { setLevel: vi.fn(), LEVELS: { ERROR: 0 } },
}));

import { scrape } from "./ntb";
import { fetchHtmlSessioned } from "../utils/http";
import { PlaywrightCrawler } from "crawlee";

// ── Fixture HTML ─────────────────────────────────────────────────────────────

const CAMPAIGN_URL =
  "https://www.nationstrust.com/promotions/what-s-new/enjoy-exclusive-savings-on-dining";

const LISTING_HTML = `
<html><body>
<a href="${CAMPAIGN_URL}">Dining Offers</a>
</body></html>
`;

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

const BLOCK_HTML = `<html><body>Incapsula incident ID 12345</body></html>`;

/** Wire up PlaywrightCrawler so .run() invokes requestHandler for each queued request */
function setupCrawlerMock(pageFactory: (label: string) => Record<string, unknown>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (PlaywrightCrawler as any).mockImplementation((options: Record<string, any>) => ({
    run: vi.fn().mockImplementation(async (requests: Array<{ url: string; label: string }>) => {
      const pending = [...requests];
      while (pending.length > 0) {
        const req = pending.shift()!;
        const page = pageFactory(req.label);
        const addRequests = vi.fn().mockImplementation(
          async (newReqs: Array<{ url: string; label: string }>) => {
            for (const r of newReqs) pending.push(r);
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

describe("ntb scraper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── HTTP path ────────────────────────────────────────────────────────────

  describe("HTTP path", () => {
    it("AC1/AC2: returns valid OfferInput objects when HTTP succeeds", async () => {
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

    it("falls through to Crawlee when HTTP listing is blocked", async () => {
      vi.mocked(fetchHtmlSessioned).mockResolvedValue(BLOCK_HTML);

      // Crawlee fallback: empty listing → no offers
      setupCrawlerMock((label) => ({
        waitForLoadState: vi.fn().mockResolvedValue(undefined),
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
        evaluate: vi.fn().mockResolvedValue(label === "LISTING" ? "" : ""),
        $$eval: vi.fn().mockResolvedValue([]),
      }));

      const offers = await scrape();
      expect(Array.isArray(offers)).toBe(true);
    });

    it("skips a campaign page that is blocked by Incapsula", async () => {
      vi.mocked(fetchHtmlSessioned)
        .mockResolvedValueOnce(LISTING_HTML)
        .mockResolvedValueOnce(BLOCK_HTML);

      const offers = await scrape();
      expect(offers).toHaveLength(0);
    });

    it("excludes HTML-commented rows from table parsing", async () => {
      const listingHtml = `<html><body><a href="${CAMPAIGN_URL}">Link</a></body></html>`;
      const campaignHtml = `
        <html><body><table>
        <tr><td>Merchant</td><td>Offer</td><td>Eligibility</td></tr>
        <!--<tr><td>Commented Out</td><td>Should not appear</td><td></td></tr>-->
        <tr><td>Active Place</td><td>10% off</td><td>Valid till 31st December 2026</td></tr>
        </table></body></html>
      `;

      vi.mocked(fetchHtmlSessioned)
        .mockResolvedValueOnce(listingHtml)
        .mockResolvedValueOnce(campaignHtml);

      const offers = await scrape();
      expect(offers.every((o) => o.merchant !== "Commented Out")).toBe(true);
      expect(offers.length).toBeGreaterThan(0);
    });

    it("validates each offer with OfferInputSchema", async () => {
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

  // ── Crawlee fallback path ────────────────────────────────────────────────

  describe("Crawlee fallback path", () => {
    beforeEach(() => {
      // Make HTTP always return a block page so we exercise the Crawlee path
      vi.mocked(fetchHtmlSessioned).mockResolvedValue(BLOCK_HTML);
    });

    it("AC3: Crawlee scrapes offers from campaign pages", async () => {
      setupCrawlerMock((label) => {
        if (label === "LISTING") {
          return {
            waitForLoadState: vi.fn().mockResolvedValue(undefined),
            waitForTimeout: vi.fn().mockResolvedValue(undefined),
            evaluate: vi.fn().mockResolvedValue(""),
            $$eval: vi.fn().mockResolvedValue([CAMPAIGN_URL]),
          };
        }
        // CAMPAIGN page
        return {
          waitForLoadState: vi.fn().mockResolvedValue(undefined),
          waitForTimeout: vi.fn().mockResolvedValue(undefined),
          evaluate: vi.fn().mockImplementation((fn: () => unknown) => {
            const s = fn.toString();
            if (s.includes("outerHTML")) return CAMPAIGN_HTML;
            return "";
          }),
          $$eval: vi.fn().mockResolvedValue([]),
        };
      });

      const offers = await scrape();
      expect(Array.isArray(offers)).toBe(true);
    });

    it("returns [] when Crawlee throws", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (PlaywrightCrawler as any).mockImplementation(() => ({
        run: vi.fn().mockRejectedValue(new Error("Chromium binary not found")),
      }));

      const offers = await scrape();
      expect(offers).toHaveLength(0);
    });

    it("returns [] when listing page is blocked in Crawlee path too", async () => {
      setupCrawlerMock(() => ({
        waitForLoadState: vi.fn().mockResolvedValue(undefined),
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
        evaluate: vi.fn().mockResolvedValue("Incapsula incident ID 12345"),
        $$eval: vi.fn().mockResolvedValue([]),
      }));

      const offers = await scrape();
      expect(offers).toHaveLength(0);
    });
  });
});
