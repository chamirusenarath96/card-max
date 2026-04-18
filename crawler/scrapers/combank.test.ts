/**
 * Commercial Bank scraper — unit tests
 * Spec: specs/features/002-crawler.md (AC1, AC2)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../utils/http", () => ({
  fetchHtml: vi.fn(),
  pLimit: (tasks: Array<() => Promise<unknown>>, _n: number) =>
    Promise.all(tasks.map((t) => t())),
  sleep: vi.fn(),
}));

import { scrape } from "./combank";
import { fetchHtml } from "../utils/http";

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

// discountPercentage 200 exceeds OfferInputSchema max(100) → safeParse fails
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
});
