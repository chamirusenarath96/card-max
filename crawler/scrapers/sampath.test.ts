/**
 * Sampath Bank scraper — unit tests
 * Spec: specs/features/002-crawler.md (AC1, AC2)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../utils/http", () => ({
  fetchJson: vi.fn(),
  sleep: vi.fn(),
}));

import { scrape } from "./sampath";
import { fetchJson } from "../utils/http";

const VALID_PROMOTION = {
  id: 1,
  company_name: "Pizza Hut",
  short_discount: "15% off",
  category: "dining",
  expire_on: 1775000000000,
  display_on: 1700000000000,
  image_url: "https://www.sampath.lk/images/pizza-hut.jpg",
};

// discountPercentage 200 exceeds OfferInputSchema max(100) → safeParse fails
const INVALID_PROMOTION = {
  id: 2,
  company_name: "Test Merchant",
  short_discount: "200% off",
  category: "shopping",
};

describe("sampath scraper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an array of valid OfferInput objects (AC1, AC2)", async () => {
    vi.mocked(fetchJson).mockResolvedValue({ data: [VALID_PROMOTION] });

    const offers = await scrape();

    expect(Array.isArray(offers)).toBe(true);
    expect(offers.length).toBeGreaterThan(0);
    expect(offers[0]).toMatchObject({
      bank: "sampath_bank",
      bankDisplayName: "Sampath Bank",
      title: "Pizza Hut",
      merchant: "Pizza Hut",
      category: "dining",
      sourceUrl: expect.stringContaining("sampath.lk"),
    });
  });

  it("skips offers that fail Zod validation (AC2)", async () => {
    vi.mocked(fetchJson).mockResolvedValue({ data: [INVALID_PROMOTION] });

    const offers = await scrape();

    expect(offers).toHaveLength(0);
  });

  it("handles top-level array response shape", async () => {
    vi.mocked(fetchJson).mockResolvedValue([VALID_PROMOTION]);

    const offers = await scrape();

    expect(offers.length).toBeGreaterThan(0);
    expect(offers[0].bank).toBe("sampath_bank");
  });

  it("returns empty array when API returns no promotions", async () => {
    vi.mocked(fetchJson).mockResolvedValue({ data: [] });

    const offers = await scrape();

    expect(offers).toHaveLength(0);
  });

  it("mixes valid and invalid offers, returning only valid ones", async () => {
    vi.mocked(fetchJson).mockResolvedValue({
      data: [VALID_PROMOTION, INVALID_PROMOTION],
    });

    const offers = await scrape();

    expect(offers).toHaveLength(1);
    expect(offers[0].merchant).toBe("Pizza Hut");
  });
});
