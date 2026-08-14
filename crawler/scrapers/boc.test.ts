/**
 * Bank of Ceylon (BOC) scraper — unit tests
 * Spec: specs/features/011-new-banks.md
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../utils/http", () => ({
  fetchHtml: vi.fn(),
  sleep: vi.fn(),
}));

vi.mock("../utils/proxyProviders/registry", () => ({
  getConfiguredProviders: vi.fn(() => []),
  getBankProviderMap: vi.fn(() => ({})),
  orderedProvidersForBank: vi.fn(() => []),
}));

import { scrape } from "./boc";
import { fetchHtml } from "../utils/http";
import { getConfiguredProviders, orderedProvidersForBank } from "../utils/proxyProviders/registry";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const CATEGORY_HTML = `
<html><body>
  <a href="/personal-banking/card-offers/dining/pizza-hut/product" class="swiper-slide product unique">
    <figure class="offer-logo-wrap">
      <div class="offers-panel">
        <div class="offer"><p><strong>15% OFF*</strong></p></div>
      </div>
      <img class="offer-logo" src="https://s3.ap-southeast-1.amazonaws.com/static.boc.lk/1234/pizza-hut.jpg" alt="BOC - Pizza Hut">
    </figure>
    <div class="product-detail">
      <div class="top">
        <h4>Pizza Hut</h4>
        <p class="location-name">Colombo, Sri Lanka</p>
        <div class="description"><p>15% off on Food &amp; Beverages for BOC Credit Cardholders</p></div>
        <table class="highligh-box">
          <tr>
            <td>Expiration date : </td>
            <td>31 Dec 2026</td>
          </tr>
        </table>
      </div>
    </div>
  </a>

  <a href="/personal-banking/card-offers/dining/keells/product" class="swiper-slide product unique">
    <figure class="offer-logo-wrap">
      <div class="offers-panel">
        <div class="offer"><p><strong>10% OFF*</strong></p></div>
      </div>
      <img class="offer-logo" src="https://s3.ap-southeast-1.amazonaws.com/static.boc.lk/5678/keells.jpg" alt="BOC - Keells">
    </figure>
    <div class="product-detail">
      <div class="top">
        <h4>Keells</h4>
        <p class="location-name">Nationwide</p>
        <div class="description"><p>10% off for BOC Credit Cardholders at Keells Super</p></div>
        <table class="highligh-box">
          <tr>
            <td>Expiration date : </td>
            <td>30 Jun 2026</td>
          </tr>
        </table>
      </div>
    </div>
  </a>
</body></html>
`;

const EMPTY_HTML = `<html><body><p>No offers available</p></body></html>`;

// ── Tests ────────────────────────────────────────────────────────────────────

describe("boc scraper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns array and all offers have bank=bank_of_ceylon", async () => {
    vi.mocked(fetchHtml).mockResolvedValue(CATEGORY_HTML);

    const offers = await scrape();

    expect(Array.isArray(offers)).toBe(true);
    expect(offers.length).toBeGreaterThan(0);
    offers.forEach((o) => {
      expect(o.bank).toBe("bank_of_ceylon");
      expect(o.bankDisplayName).toBe("Bank of Ceylon");
    });
  });

  it("parses merchant name and source URL from offer card", async () => {
    vi.mocked(fetchHtml).mockResolvedValue(CATEGORY_HTML);

    const offers = await scrape();
    const pizzaHut = offers.find((o) => o.merchant === "Pizza Hut");

    expect(pizzaHut).toBeDefined();
    expect(pizzaHut?.sourceUrl).toContain("boc.lk");
  });

  it("extracts merchant logo URL from S3 CDN", async () => {
    vi.mocked(fetchHtml).mockResolvedValue(CATEGORY_HTML);

    const offers = await scrape();
    const pizzaHut = offers.find((o) => o.merchant === "Pizza Hut");

    expect(pizzaHut?.merchantLogoUrl).toBe(
      "https://s3.ap-southeast-1.amazonaws.com/static.boc.lk/1234/pizza-hut.jpg",
    );
  });

  it("extracts description from .description div", async () => {
    vi.mocked(fetchHtml).mockResolvedValue(CATEGORY_HTML);

    const offers = await scrape();
    const pizzaHut = offers.find((o) => o.merchant === "Pizza Hut");

    expect(pizzaHut?.description).toContain("15% off on Food & Beverages");
  });

  it("parses expiration date correctly", async () => {
    vi.mocked(fetchHtml).mockResolvedValue(CATEGORY_HTML);

    const offers = await scrape();
    const pizzaHut = offers.find((o) => o.merchant === "Pizza Hut");

    expect(pizzaHut?.validUntil).toBeInstanceOf(Date);
    expect(pizzaHut?.validUntil!.getFullYear()).toBe(2026);
    expect(pizzaHut?.validUntil!.getMonth()).toBe(11); // December = 11
  });

  it("extracts discount label and sets offerType=percentage", async () => {
    vi.mocked(fetchHtml).mockResolvedValue(CATEGORY_HTML);

    const offers = await scrape();
    const pizzaHut = offers.find((o) => o.merchant === "Pizza Hut");

    expect(pizzaHut?.discountLabel).toContain("15");
    expect(pizzaHut?.offerType).toBe("percentage");
    expect(pizzaHut?.discountPercentage).toBe(15);
  });

  it("returns empty array when page has no offer cards", async () => {
    vi.mocked(fetchHtml).mockResolvedValue(EMPTY_HTML);

    const offers = await scrape();

    expect(offers).toHaveLength(0);
  });

  it("returns [] when HTTP request fails without throwing", async () => {
    vi.mocked(fetchHtml).mockRejectedValue(new Error("Network error"));

    const offers = await scrape();

    expect(offers).toHaveLength(0);
  });

  it("parses multiple offers from a single category page", async () => {
    vi.mocked(fetchHtml).mockResolvedValue(CATEGORY_HTML);

    const offers = await scrape();
    const merchants = offers.map((o) => o.merchant);

    expect(merchants).toContain("Pizza Hut");
    expect(merchants).toContain("Keells");
  });

  it("recovers a category whose direct fetch rejects but proxy fetch succeeds, and skips a category where both reject (AC14)", async () => {
    const proxyFetchHtml = vi.fn().mockResolvedValue(CATEGORY_HTML);
    vi.mocked(getConfiguredProviders).mockReturnValue([{ name: "zenrows", fetchHtml: proxyFetchHtml }]);
    vi.mocked(orderedProvidersForBank).mockReturnValue([{ name: "zenrows", fetchHtml: proxyFetchHtml }]);

    // First category: direct fetch fails, proxy recovers. Remaining categories: both fail (skipped).
    vi.mocked(fetchHtml)
      .mockRejectedValueOnce(new Error("HTTP 403"))
      .mockRejectedValue(new Error("HTTP 403"));
    proxyFetchHtml.mockResolvedValueOnce(CATEGORY_HTML).mockRejectedValue(new Error("Proxy also failed"));

    const offers = await scrape();

    expect(offers.length).toBeGreaterThan(0);
    const merchants = offers.map((o) => o.merchant);
    expect(merchants).toContain("Pizza Hut");
  });

  it("falls back to webscrapingapi when ZenRows returns REQS001 and succeeds via second provider (067 AC1)", async () => {
    const zenrowsFetch = vi.fn().mockRejectedValue(new Error("ZenRows HTTP 403 fetching https://www.boc.lk/personal-banking/card-offers/online: REQS001: Requests to this domain are forbidden"));
    const wsaFetch = vi.fn().mockResolvedValue(CATEGORY_HTML);
    vi.mocked(getConfiguredProviders).mockReturnValue([
      { name: "zenrows", fetchHtml: zenrowsFetch },
      { name: "webscrapingapi", fetchHtml: wsaFetch },
    ]);
    vi.mocked(orderedProvidersForBank).mockReturnValue([
      { name: "zenrows", fetchHtml: zenrowsFetch },
      { name: "webscrapingapi", fetchHtml: wsaFetch },
    ]);

    // Direct fetch fails for first category, then proxy retries zenrows (REQS001) then wsa succeeds
    vi.mocked(fetchHtml).mockRejectedValue(new Error("HTTP 403"));
    // For remaining categories, both direct and proxy fail to keep test isolated to one success
    // The proxy loop will try zenrows (fail) then wsa (success) for first category
    const offers = await scrape();
    expect(zenrowsFetch).toHaveBeenCalled();
    expect(wsaFetch).toHaveBeenCalled();
    expect(offers.length).toBeGreaterThan(0);
    expect(offers[0].merchant).toBe("Pizza Hut");
  });

  it("surfaces error when ZenRows REQS001 and no secondary provider is configured (067 AC4)", async () => {
    const zenrowsFetch = vi.fn().mockRejectedValue(new Error("REQS001: Requests to this domain are forbidden"));
    vi.mocked(getConfiguredProviders).mockReturnValue([{ name: "zenrows", fetchHtml: zenrowsFetch }]);
    vi.mocked(orderedProvidersForBank).mockReturnValue([{ name: "zenrows", fetchHtml: zenrowsFetch }]);
    vi.mocked(fetchHtml).mockRejectedValue(new Error("HTTP 403"));

    const offers = await scrape();
    // All categories fail, so 0 offers - surfaced as empty, not thrown, and will trigger zero_offers via failureAlerts
    expect(offers).toHaveLength(0);
    expect(zenrowsFetch).toHaveBeenCalled();
  });
});
