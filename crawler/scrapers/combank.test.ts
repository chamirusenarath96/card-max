/**
 * Commercial Bank scraper â€” unit tests
 * Spec: specs/features/002-crawler.md (AC1, AC2)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../utils/http", () => ({
  fetchHtml: vi.fn(),
  pLimit: (tasks: Array<() => Promise<unknown>>, _n: number) =>
    Promise.all(tasks.map((t) => t())),
  sleep: vi.fn(),
}));

vi.mock("../utils/proxyProviders/registry", () => ({
  getConfiguredProviders: vi.fn(() => []),
  getBankProviderMap: vi.fn(() => ({})),
  orderedProvidersForBank: vi.fn(() => []),
}));

import { scrape } from "./combank";
import { fetchHtml } from "../utils/http";
import { getConfiguredProviders, orderedProvidersForBank } from "../utils/proxyProviders/registry";

const LISTING_HTML = `
<html><body>
  <a href="/rewards-promotion/dining/pizza-hut-offer-2026">Pizza Hut</a>
</body></html>
`;

const DETAIL_HTML = `
<html>
<head>
  <meta property="og:image" content="https://www.combank.lk/uploads/promo/pizza.jpg">
</head>
<body>
  <h2>15% discount at Pizza Hut</h2>
  <p>Enjoy 15% off on all orders. Valid till 31st December 2026.</p>
</body>
</html>
`;

// discountPercentage 200 exceeds OfferInputSchema max(100) â†’ safeParse fails
const INVALID_DETAIL_HTML = `
<html><body>
  <h2>200% off at Test Merchant</h2>
  <p>200% off promo.</p>
</body></html>
`;

describe("combank scraper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an array of valid OfferInput objects (AC1, AC2)", async () => {
    vi.mocked(fetchHtml)
      .mockResolvedValueOnce(LISTING_HTML)
      .mockResolvedValue(DETAIL_HTML);

    const offers = await scrape();

    expect(Array.isArray(offers)).toBe(true);
    expect(offers.length).toBeGreaterThan(0);
    expect(offers[0]).toMatchObject({
      bank: "commercial_bank",
      bankDisplayName: "Commercial Bank",
      title: expect.any(String),
      merchant: expect.any(String),
      category: expect.any(String),
      sourceUrl: expect.stringContaining("combank.lk"),
    });
  });

  it("skips offers that fail Zod validation (AC2)", async () => {
    vi.mocked(fetchHtml)
      .mockResolvedValueOnce(LISTING_HTML)
      .mockResolvedValue(INVALID_DETAIL_HTML);

    const offers = await scrape();

    expect(offers).toHaveLength(0);
  });

  it("returns empty array when listing page has no offer links", async () => {
    vi.mocked(fetchHtml).mockResolvedValue("<html><body>No offers</body></html>");

    const offers = await scrape();

    expect(offers).toHaveLength(0);
  });

  it("continues and skips a link when a detail page fetch fails", async () => {
    vi.mocked(fetchHtml)
      .mockResolvedValueOnce(LISTING_HTML)
      .mockRejectedValue(new Error("Network error"));

    const offers = await scrape();

    expect(Array.isArray(offers)).toBe(true);
    expect(offers).toHaveLength(0);
  });

  it("still returns parsed offers when the listing-page direct fetch rejects but the configured proxy provider succeeds (AC13)", async () => {
    const proxyFetchHtml = vi.fn().mockResolvedValue(LISTING_HTML);
    vi.mocked(getConfiguredProviders).mockReturnValue([{ name: "zenrows", fetchHtml: proxyFetchHtml }]);
    vi.mocked(orderedProvidersForBank).mockReturnValue([{ name: "zenrows", fetchHtml: proxyFetchHtml }]);

    vi.mocked(fetchHtml)
      .mockRejectedValueOnce(new Error("HTTP 403"))
      .mockResolvedValue(DETAIL_HTML);

    const offers = await scrape();

    expect(proxyFetchHtml).toHaveBeenCalledWith(expect.stringContaining("combank.lk"), "commercial_bank");
    expect(offers.length).toBeGreaterThan(0);
  });

  it("retries on ConnectTimeoutError via proxyFetch and returns offers on retry (063 AC1)", async () => {
    const err = new Error("fetch failed");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (err as any).cause = new Error("ConnectTimeoutError: Connect Timeout Error");
    vi.mocked(fetchHtml)
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce(LISTING_HTML)
      .mockResolvedValue(DETAIL_HTML);

    const offers = await scrape();

    expect(offers.length).toBeGreaterThan(0);
    expect(offers[0].bank).toBe("commercial_bank");
  });
});

