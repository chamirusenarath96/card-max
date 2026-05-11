/**
 * People's Bank scraper — unit tests
 * Spec: specs/features/011-new-banks.md
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../utils/http", () => ({
  fetchHtml: vi.fn(),
  sleep: vi.fn(),
}));

import { scrape } from "./peoples_bank";
import { fetchHtml } from "../utils/http";

// ── Fixtures ─────────────────────────────────────────────────────────────────

/**
 * Mimics the current People's Bank promotion page using .promotion-card tiles.
 * Note: inner content must not have nested <div>s because the card regex
 * stops at the first </div> followed by <div or </.
 */
const CARD_HTML = `
<html><body>
<div class="promotions-wrapper"><div class="promotion-card">
<span class="discount-badge">15% off</span>
<img src="https://www.peoplesbank.lk/images/promotions/pizza-hut.jpg" alt="Pizza Hut">
<h3><a href="/pizza-hut-offer">Pizza Hut</a></h3>
<p>Enjoy 15% discount on dine-in and takeaway orders at all Pizza Hut outlets island-wide.</p>
<p>Valid till 31 December 2026</p>
</div>
<div class="promotion-card">
<span class="discount-badge">10% off</span>
<img src="https://www.peoplesbank.lk/images/promotions/keells.jpg" alt="Keells">
<h3><a href="/keells-offer">Keells Super</a></h3>
<p>Get 10% savings on groceries at all Keells Super outlets island-wide.</p>
<p>Valid from 01 January 2026 to 30 June 2026</p>
</div>
</div>
</body></html>
`;

/** Heading-based layout — exercises parseViaHeadings fallback. */
const HEADING_HTML = `
<html><body>
  <main>
    <h3>Buy 1 Get 1 Free at Barista Coffee</h3>
    <p>Complimentary coffee for People's Bank cardholders. Valid till 31 March 2026.</p>
  </main>
</body></html>
`;

/** Table-based layout — exercises parseViaTableRows fallback. */
const TABLE_HTML = `
<html><body>
  <table>
    <thead><tr><th>Merchant</th><th>Offer</th><th>Valid Until</th></tr></thead>
    <tbody>
      <tr>
        <td>Cargills Food City</td>
        <td>5% cashback on all purchases</td>
        <td>Valid till 31 December 2026</td>
      </tr>
    </tbody>
  </table>
</body></html>
`;

const EMPTY_HTML = `<html><body><p>No promotions at this time.</p></body></html>`;

// ── Tests ────────────────────────────────────────────────────────────────────

describe("peoples_bank scraper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns array and all offers have bank=peoples_bank", async () => {
    vi.mocked(fetchHtml).mockResolvedValue(CARD_HTML);

    const offers = await scrape();

    expect(Array.isArray(offers)).toBe(true);
    expect(offers.length).toBeGreaterThan(0);
    offers.forEach((o) => {
      expect(o.bank).toBe("peoples_bank");
      expect(o.bankDisplayName).toBe("People's Bank");
    });
  });

  it("parses offer title and merchant from .promotion-card tiles", async () => {
    vi.mocked(fetchHtml).mockResolvedValue(CARD_HTML);

    const offers = await scrape();

    expect(offers.some((o) => o.title.includes("Pizza Hut"))).toBe(true);
  });

  it("extracts merchant logo URL from img tag", async () => {
    vi.mocked(fetchHtml).mockResolvedValue(CARD_HTML);

    const offers = await scrape();
    const pizzaHut = offers.find((o) => o.title.includes("Pizza Hut"));

    expect(pizzaHut?.merchantLogoUrl).toContain("peoplesbank.lk");
  });

  it("extracts validUntil date from 'valid till DD Month YYYY'", async () => {
    vi.mocked(fetchHtml).mockResolvedValue(CARD_HTML);

    const offers = await scrape();
    const pizzaHut = offers.find((o) => o.title.includes("Pizza Hut"));

    expect(pizzaHut?.validUntil).toBeInstanceOf(Date);
    expect(pizzaHut?.validUntil!.getFullYear()).toBe(2026);
  });

  it("extracts validFrom and validUntil from a date range", async () => {
    vi.mocked(fetchHtml).mockResolvedValue(CARD_HTML);

    const offers = await scrape();
    const keells = offers.find((o) => o.title.includes("Keells"));

    expect(keells?.validFrom).toBeInstanceOf(Date);
    expect(keells?.validUntil).toBeInstanceOf(Date);
  });

  it("classifies percentage discount correctly from discount-badge", async () => {
    vi.mocked(fetchHtml).mockResolvedValue(CARD_HTML);

    const offers = await scrape();
    const pizzaHut = offers.find((o) => o.title.includes("Pizza Hut"));

    expect(pizzaHut?.offerType).toBe("percentage");
    expect(pizzaHut?.discountPercentage).toBe(15);
  });

  it("deduplicates offers seen across multiple category pages", async () => {
    vi.mocked(fetchHtml).mockResolvedValue(CARD_HTML);

    const offers = await scrape();

    const pizzaHutOffers = offers.filter((o) => o.title.includes("Pizza Hut"));
    expect(pizzaHutOffers.length).toBe(1);
  });

  it("falls back to parsing heading elements", async () => {
    vi.mocked(fetchHtml).mockResolvedValue(HEADING_HTML);

    const offers = await scrape();

    expect(offers.length).toBeGreaterThan(0);
    expect(offers[0]?.bank).toBe("peoples_bank");
  });

  it("falls back to parsing table rows", async () => {
    vi.mocked(fetchHtml).mockResolvedValue(TABLE_HTML);

    const offers = await scrape();

    expect(offers.length).toBeGreaterThan(0);
    const cargills = offers.find((o) =>
      o.merchant.toLowerCase().includes("cargills"),
    );
    expect(cargills).toBeDefined();
  });

  it("returns empty array when page has no parseable offers", async () => {
    vi.mocked(fetchHtml).mockResolvedValue(EMPTY_HTML);

    const offers = await scrape();

    expect(offers).toHaveLength(0);
  });

  it("returns empty array on HTTP error without throwing", async () => {
    vi.mocked(fetchHtml).mockRejectedValue(new Error("HTTP 403"));

    const offers = await scrape();

    expect(offers).toHaveLength(0);
  });
});
