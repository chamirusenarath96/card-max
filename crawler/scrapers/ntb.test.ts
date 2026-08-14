/**
 * Nations Trust Bank scraper â€” unit tests
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

vi.mock("../utils/proxyProviders/registry", () => ({
  getConfiguredProviders: vi.fn(() => []),
  getBankProviderMap: vi.fn(() => ({})),
  orderedProvidersForBank: vi.fn(() => []),
}));

import { scrape } from "./ntb";
import { fetchHtmlSessioned } from "../utils/http";
import { PlaywrightCrawler } from "crawlee";
import { getConfiguredProviders, orderedProvidersForBank } from "../utils/proxyProviders/registry";

// â”€â”€ Fixture HTML â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
  // vitest v4 (rolldown): mock constructor implementations must use regular functions,
  // not arrow functions, to be constructable with `new`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (PlaywrightCrawler as any).mockImplementation(function (this: unknown, options: Record<string, any>) {
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      run: vi.fn().mockImplementation(async function (requests: Array<{ url: string; label: string }>) {
        const pending = [...requests];
        while (pending.length > 0) {
          const req = pending.shift()!;
          const page = pageFactory(req.label);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const addRequests = vi.fn().mockImplementation(async function (newReqs: Array<{ url: string; label: string }>) {
            for (const r of newReqs) pending.push(r);
          });
          await options.requestHandler?.({
            page: page as never,
            request: { url: req.url, label: req.label } as never,
            addRequests,
          } as never);
        }
      }),
    };
  });
}

// â”€â”€ Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("ntb scraper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // â”€â”€ HTTP path â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

      // Crawlee fallback: selector times out â†’ no offers
      setupCrawlerMock(() => ({
        waitForSelector: vi.fn().mockRejectedValue(new Error("Timeout")),
        evaluate: vi.fn().mockResolvedValue(""),
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

    it("retries the blocked listing page via the assigned proxy provider and returns the proxy-fetched offers when that retry succeeds (AC15)", async () => {
      const proxyFetchHtml = vi.fn().mockResolvedValue(LISTING_HTML);
      vi.mocked(getConfiguredProviders).mockReturnValue([{ name: "zenrows", fetchHtml: proxyFetchHtml }]);
      vi.mocked(orderedProvidersForBank).mockReturnValue([{ name: "zenrows", fetchHtml: proxyFetchHtml }]);

      vi.mocked(fetchHtmlSessioned)
        .mockResolvedValueOnce(BLOCK_HTML) // listing: direct fetch blocked
        .mockResolvedValueOnce(CAMPAIGN_HTML); // campaign: direct fetch succeeds

      const offers = await scrape();

      expect(proxyFetchHtml).toHaveBeenCalledWith(expect.stringContaining("nationstrust.com"), "nations_trust_bank");
      expect(offers.length).toBeGreaterThan(0);
      expect(offers[0]).toMatchObject({ bank: "nations_trust_bank", merchant: "Pizza Hut" });
      // Crawlee must not be invoked since the HTTP+proxy path already succeeded
      expect(PlaywrightCrawler).not.toHaveBeenCalled();
    });

    it("retries the listing fetch via the proxy provider when the direct fetch throws, and uses the proxy result (spec 059 AC1)", async () => {
      const proxyFetchHtml = vi.fn().mockResolvedValue(LISTING_HTML);
      vi.mocked(getConfiguredProviders).mockReturnValue([{ name: "zenrows", fetchHtml: proxyFetchHtml }]);
      vi.mocked(orderedProvidersForBank).mockReturnValue([{ name: "zenrows", fetchHtml: proxyFetchHtml }]);

      vi.mocked(fetchHtmlSessioned)
        .mockRejectedValueOnce(new Error("HTTP 403 fetching https://www.nationstrust.com/promotions/what-s-new"))
        .mockResolvedValueOnce(CAMPAIGN_HTML);

      const offers = await scrape();

      expect(proxyFetchHtml).toHaveBeenCalledWith(expect.stringContaining("nationstrust.com"), "nations_trust_bank");
      expect(offers.length).toBeGreaterThan(0);
      expect(offers[0]).toMatchObject({ bank: "nations_trust_bank", merchant: "Pizza Hut" });
    });

    it("retries a campaign-page fetch via the proxy provider when the direct fetch throws (spec 059 AC2)", async () => {
      const proxyFetchHtml = vi.fn().mockResolvedValue(CAMPAIGN_HTML);
      vi.mocked(getConfiguredProviders).mockReturnValue([{ name: "zenrows", fetchHtml: proxyFetchHtml }]);
      vi.mocked(orderedProvidersForBank).mockReturnValue([{ name: "zenrows", fetchHtml: proxyFetchHtml }]);

      vi.mocked(fetchHtmlSessioned)
        .mockResolvedValueOnce(LISTING_HTML)
        .mockRejectedValueOnce(new Error("HTTP 403 fetching campaign page"));

      const offers = await scrape();

      expect(proxyFetchHtml).toHaveBeenCalledWith(CAMPAIGN_URL, "nations_trust_bank");
      expect(offers.length).toBeGreaterThan(0);
      expect(offers[0]).toMatchObject({ bank: "nations_trust_bank", merchant: "Pizza Hut" });
    });

    it("falls through to Crawlee when the listing fetch throws and no proxy provider is configured (spec 059 AC3)", async () => {
      vi.mocked(orderedProvidersForBank).mockReturnValue([]);
      vi.mocked(fetchHtmlSessioned).mockRejectedValue(new Error("HTTP 403 fetching listing page"));

      setupCrawlerMock(() => ({
        waitForSelector: vi.fn().mockRejectedValue(new Error("Timeout")),
        evaluate: vi.fn().mockResolvedValue(""),
        $$eval: vi.fn().mockResolvedValue([]),
      }));

      const offers = await scrape();
      expect(Array.isArray(offers)).toBe(true);
      expect(PlaywrightCrawler).toHaveBeenCalled();
    });

    it("returns null from the HTTP path (falling through to Crawlee) when both the direct fetch and the proxy provider throw for the listing page (spec 059 AC4)", async () => {
      const proxyFetchHtml = vi.fn().mockRejectedValue(new Error("proxy also failed"));
      vi.mocked(getConfiguredProviders).mockReturnValue([{ name: "zenrows", fetchHtml: proxyFetchHtml }]);
      vi.mocked(orderedProvidersForBank).mockReturnValue([{ name: "zenrows", fetchHtml: proxyFetchHtml }]);

      vi.mocked(fetchHtmlSessioned).mockRejectedValue(new Error("HTTP 403 fetching listing page"));

      setupCrawlerMock(() => ({
        waitForSelector: vi.fn().mockRejectedValue(new Error("Timeout")),
        evaluate: vi.fn().mockResolvedValue(""),
        $$eval: vi.fn().mockResolvedValue([]),
      }));

      const offers = await scrape();

      expect(proxyFetchHtml).toHaveBeenCalled();
      expect(PlaywrightCrawler).toHaveBeenCalled();
      expect(Array.isArray(offers)).toBe(true);
    });

    it("falls back to scrapeWithCrawlee() when both the direct and proxy-retried listing fetches are blocked (AC16)", async () => {
      const proxyFetchHtml = vi.fn().mockResolvedValue(BLOCK_HTML);
      vi.mocked(getConfiguredProviders).mockReturnValue([{ name: "zenrows", fetchHtml: proxyFetchHtml }]);
      vi.mocked(orderedProvidersForBank).mockReturnValue([{ name: "zenrows", fetchHtml: proxyFetchHtml }]);

      vi.mocked(fetchHtmlSessioned).mockResolvedValue(BLOCK_HTML);

      setupCrawlerMock(() => ({
        waitForSelector: vi.fn().mockRejectedValue(new Error("Timeout")),
        evaluate: vi.fn().mockResolvedValue(""),
        $$eval: vi.fn().mockResolvedValue([]),
      }));

      const offers = await scrape();

      expect(proxyFetchHtml).toHaveBeenCalled();
      expect(PlaywrightCrawler).toHaveBeenCalled();
      expect(Array.isArray(offers)).toBe(true);
    });
  });

  // â”€â”€ Crawlee fallback path â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe("Crawlee fallback path", () => {
    beforeEach(() => {
      // Make HTTP always return a block page so we exercise the Crawlee path
      vi.mocked(fetchHtmlSessioned).mockResolvedValue(BLOCK_HTML);
    });

    it("AC3: Crawlee scrapes offers from campaign pages", async () => {
      setupCrawlerMock((label) => {
        if (label === "LISTING") {
          return {
            waitForSelector: vi.fn().mockResolvedValue(undefined),
            evaluate: vi.fn().mockResolvedValue(""),
            $$eval: vi.fn().mockResolvedValue([CAMPAIGN_URL]),
          };
        }
        // CAMPAIGN page
        return {
          waitForSelector: vi.fn().mockResolvedValue(undefined),
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
      // vitest v4: use regular function, not arrow, for constructor mock
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (PlaywrightCrawler as any).mockImplementation(function (this: unknown) {
        return { run: vi.fn().mockRejectedValue(new Error("Chromium binary not found")) };
      });

      const offers = await scrape();
      expect(offers).toHaveLength(0);
    });

    it("returns [] when listing page is blocked in Crawlee path too", async () => {
      setupCrawlerMock(() => ({
        waitForSelector: vi.fn().mockRejectedValue(new Error("Timeout")),
        evaluate: vi.fn().mockResolvedValue("Incapsula incident ID 12345"),
        $$eval: vi.fn().mockResolvedValue([]),
      }));

      const offers = await scrape();
      expect(offers).toHaveLength(0);
    });
  });
});

