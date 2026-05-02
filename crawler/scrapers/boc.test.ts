/**
 * Bank of Ceylon (BOC) scraper — unit tests
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../utils/http", () => ({
  fetchHtml: vi.fn(),
  sleep: vi.fn(),
}));

import { scrape } from "./boc";
import { fetchHtml } from "../utils/http";

// ── Fixtures ─────────────────────────────────────────────────────────────────

/**
 * Minimal HTML that mimics a BOC category listing page with two offer cards.
 */
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
        <div class="description"><p>15% off on Food &amp; Beverages for BOC Credit &amp; Debit Cardholders</p></div>
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

  it("parses offer cards and returns valid OfferInput objects", async () => {
    vi.mocked(fetchHtml).mockResolvedValue(CATEGORY_HTML);

    const offers = await scrape();

    expect(Array.isArray(offers)).toBe(true);
    expect(offers.length).toBeGreaterThan(0);

    const first = offers[0]!;
    expect(first.bank).toBe("boc");
    expect(first.bankDisplayName).toBe("Bank of Ceylon");
    expect(first.merchant).toBe("Pizza Hut");
    expect(first.category).toBeTypeOf("string");
    expect(first.sourceUrl).toContain("boc.lk");
    expect(first.title).toBeTypeOf("string");
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

  it("extracts discount label and sets offerType", async () => {
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

  it("continues scraping other categories when one fails", async () => {
    vi.mocked(fetchHtml)
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValue(CATEGORY_HTML);

    const offers = await scrape();

    // Should still return offers from other categories
    expect(offers.length).toBeGreaterThan(0);
  });

  it("parses multiple offers from a single category page", async () => {
    vi.mocked(fetchHtml).mockResolvedValue(CATEGORY_HTML);

    const offers = await scrape();
    const merchants = offers.map((o) => o.merchant);

    expect(merchants).toContain("Pizza Hut");
    expect(merchants).toContain("Keells");
  });
});
