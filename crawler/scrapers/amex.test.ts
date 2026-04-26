/**
 * American Express NTB scraper — unit tests
 * Spec: specs/features/010-amex-offers.md
 *
 * Test Cases covered (per spec Test Cases table):
 *   TC1: BankSchema accepts "amex_ntb"             → unit, AC1
 *   TC2: scrape() returns array (may be empty)     → unit, AC3
 *   TC3: each offer has bank: "amex_ntb"           → unit, AC5
 *   TC4: HTTP error → returns [], no throw         → unit, AC6
 *   TC5: Error page → returns []                   → unit, AC6
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../utils/http", () => ({
  fetchHtmlSessioned: vi.fn(),
  sleep: vi.fn().mockResolvedValue(undefined),
}));

import { BankSchema } from "../../specs/data/offer.schema";
import { scrape } from "./amex";
import { fetchHtmlSessioned } from "../utils/http";

// ── Fixture HTML ─────────────────────────────────────────────────────────────

const DETAIL_URL = "https://www.americanexpress.lk/en/offers/dining-offers/pizza-hut";

/** Category listing page with one offer card */
const CATEGORY_HTML = `
<html><body>
<div class="alloffer-box">
  <a href="${DETAIL_URL}" class="alloffer-box-inner">
    <div class="alloffer-image">
      <div class="value-limit"><span>Up to 25% Savings</span></div>
    </div>
    <div class="alloffer-text">
      <div class="alloffer-heading">Pizza Hut</div>
      <div class="offer-location"></div>
      ...
      <div>Valid till 31st May 2026</div>
    </div>
  </a>
</div>
</body></html>
`;

/** Incapsula block page */
const BLOCK_HTML = `<html><body>Incapsula incident ID 99999 blocked</body></html>`;

/** AmEx error page */
const ERROR_HTML = `<html><head><title>General Error - American Express</title></head><body>
<h2>Sorry, Something went wrong. Please try again later.</h2>
</body></html>`;

/** Empty page with no offers */
const EMPTY_HTML = `<html><body><div class="main_wrapper"></div></body></html>`;

// ── Tests ────────────────────────────────────────────────────────────────────

describe("amex scraper (HTTP)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // TC1 — BankSchema accepts "amex_ntb"
  it('TC1: BankSchema accepts "amex_ntb"', () => {
    const result = BankSchema.safeParse("amex_ntb");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("amex_ntb");
  });

  // TC2 — scrape() returns an array (may be empty)
  it("TC2: scrape() always returns an array", async () => {
    vi.mocked(fetchHtmlSessioned).mockResolvedValue(EMPTY_HTML);

    const offers = await scrape();

    expect(Array.isArray(offers)).toBe(true);
  });

  // TC3 — returned offers have bank: "amex_ntb"
  it("TC3: each returned offer has bank: amex_ntb", async () => {
    vi.mocked(fetchHtmlSessioned).mockResolvedValue(CATEGORY_HTML);

    const offers = await scrape();

    expect(offers.length).toBeGreaterThan(0);
    for (const offer of offers) {
      expect(offer.bank).toBe("amex_ntb");
      expect(offer.bankDisplayName).toBe("American Express (NTB)");
    }
  });

  // TC4 — HTTP throws → returns [], no throw
  it("TC4: HTTP error → returns [] and does not throw", async () => {
    vi.mocked(fetchHtmlSessioned).mockRejectedValue(new Error("Network connection refused"));

    const offers = await scrape();

    expect(Array.isArray(offers)).toBe(true);
    expect(offers).toHaveLength(0);
  });

  // TC4b — Incapsula block page → returns [] gracefully
  it("TC4b: Incapsula block page → scraper returns [] gracefully", async () => {
    vi.mocked(fetchHtmlSessioned).mockResolvedValue(BLOCK_HTML);

    const offers = await scrape();

    expect(offers).toHaveLength(0);
  });

  // TC5 — AmEx General Error page → returns []
  it("TC5: AmEx General Error page → returns [] without crashing", async () => {
    vi.mocked(fetchHtmlSessioned).mockResolvedValue(ERROR_HTML);

    const offers = await scrape();

    expect(offers).toHaveLength(0);
  });

  // Happy path — category page has offer cards
  it("extracts offers from category pages", async () => {
    vi.mocked(fetchHtmlSessioned).mockResolvedValue(CATEGORY_HTML);

    const offers = await scrape();

    expect(Array.isArray(offers)).toBe(true);
    expect(offers.length).toBeGreaterThan(0);
    expect(offers[0]).toMatchObject({
      bank: "amex_ntb",
      merchant: "Pizza Hut",
      sourceUrl: expect.stringContaining("americanexpress.lk"),
    });
  });

  // Empty category page → returns []
  it("returns empty array when category pages have no offer cards", async () => {
    vi.mocked(fetchHtmlSessioned).mockResolvedValue(EMPTY_HTML);

    const offers = await scrape();

    expect(Array.isArray(offers)).toBe(true);
  });

  // Deduplication — same offer across multiple categories only appears once
  it("deduplicates offers with the same sourceUrl across category pages", async () => {
    // All category pages return the same offer card with the same detail URL
    vi.mocked(fetchHtmlSessioned).mockResolvedValue(CATEGORY_HTML);

    const offers = await scrape();

    const urls = offers.map((o) => o.sourceUrl);
    const uniqueUrls = [...new Set(urls)];
    expect(urls.length).toBe(uniqueUrls.length);
  });
});
