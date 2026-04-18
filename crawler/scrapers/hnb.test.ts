/**
 * HNB scraper — unit tests
 * Spec: specs/features/002-crawler.md (AC1, AC2)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../utils/http", () => ({
  fetchJson: vi.fn(),
  sleep: vi.fn(),
}));

import { scrape } from "./hnb";
import { fetchJson } from "../utils/http";

const VALID_PROMOTION = {
  id: 1,
  title: "15% discount at Pizza Hut",
  thumbUrl: "/uploads/pizza-hut.jpg",
  from: "2026-01-01",
  to: "2026-12-31",
  card_type: "credit",
  content: "<p>Enjoy 15% off at Pizza Hut with your HNB credit card.</p>",
};

// discountPercentage 200 exceeds OfferInputSchema max(100) → safeParse fails
const INVALID_PROMOTION = {
  id: 2,
  title: "200% off at Test Merchant",
  thumbUrl: "",
  from: "2026-01-01",
  to: "2026-12-31",
  card_type: "credit",
  content: "<p>200% off promo.</p>",
};

const DEBIT_PROMOTION = {
  id: 3,
  title: "Special debit offer",
  thumbUrl: "",
  from: "2026-01-01",
  to: "2026-12-31",
  card_type: "debit",
  content: "<p>Debit card only offer.</p>",
};

describe("hnb scraper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an array of valid OfferInput objects (AC1, AC2)", async () => {
    vi.mocked(fetchJson).mockResolvedValue({
      status: 200,
      data: [VALID_PROMOTION],
    });

    const offers = await scrape();

    expect(Array.isArray(offers)).toBe(true);
    expect(offers.length).toBeGreaterThan(0);
    expect(offers[0]).toMatchObject({
      bank: "hnb",
      bankDisplayName: "Hatton National Bank",
      title: expect.any(String),
      merchant: expect.any(String),
      sourceUrl: expect.stringContaining("hnb.lk"),
    });
  });

  it("skips debit-only offers", async () => {
    vi.mocked(fetchJson).mockResolvedValue({
      status: 200,
      data: [DEBIT_PROMOTION],
    });

    const offers = await scrape();

    expect(offers).toHaveLength(0);
  });

  it("skips offers that fail Zod validation (AC2)", async () => {
    vi.mocked(fetchJson).mockResolvedValue({
      status: 200,
      data: [INVALID_PROMOTION],
    });

    const offers = await scrape();

    expect(offers).toHaveLength(0);
  });

  it("filters correctly when mixing credit and debit promotions", async () => {
    vi.mocked(fetchJson).mockResolvedValue({
      status: 200,
      data: [VALID_PROMOTION, DEBIT_PROMOTION],
    });

    const offers = await scrape();

    expect(offers).toHaveLength(1);
    expect(offers[0].bank).toBe("hnb");
  });

  it("throws when API returns unexpected status", async () => {
    vi.mocked(fetchJson).mockResolvedValue({ status: 500, data: [] });

    await expect(scrape()).rejects.toThrow();
  });
});
