/**
 * HNB scraper — unit tests
 * Spec: specs/features/002-crawler.md (AC1, AC2)
 *       specs/features/038-hnb-scraper-reliability.md (AC1–AC7)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../utils/http", () => ({
  fetchJson: vi.fn(),
  sleep: vi.fn(),
}));

import { scrape } from "./hnb";
import { fetchJson, sleep } from "../utils/http";

const VALID_PROMOTION = {
  id: 101,
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

const PROMO_NO_ID = {
  id: 0,
  title: "10% off at Keells",
  thumbUrl: "",
  from: "2026-01-01",
  to: "2026-12-31",
  card_type: "credit",
  content: "<p>10% off at Keells Super.</p>",
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

  // Spec 038 — retry and per-offer URL tests

  it("returns real data when API returns empty data on first 2 attempts then succeeds (AC3)", async () => {
    vi.mocked(fetchJson)
      .mockResolvedValueOnce({ status: 200, data: [] })
      .mockResolvedValueOnce({ status: 200, data: [] })
      .mockResolvedValueOnce({ status: 200, data: [VALID_PROMOTION] });

    const offers = await scrape();

    expect(offers).toHaveLength(1);
    expect(offers[0].bank).toBe("hnb");
    expect(vi.mocked(fetchJson)).toHaveBeenCalledTimes(3);
    expect(vi.mocked(sleep)).toHaveBeenCalledTimes(2);
  });

  it("returns [] and logs WARNING when all 3 attempts return empty data (AC1, AC2)", async () => {
    vi.mocked(fetchJson).mockResolvedValue({ status: 200, data: [] });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const offers = await scrape();

    expect(offers).toHaveLength(0);
    expect(vi.mocked(fetchJson)).toHaveBeenCalledTimes(3);
    const warningCalls = warnSpy.mock.calls.map((c) => c[0] as string);
    expect(warningCalls.some((msg) => msg.includes("[hnb] WARNING"))).toBe(true);
    warnSpy.mockRestore();
  });

  it("does not retry when API returns non-empty data on first attempt (AC1)", async () => {
    vi.mocked(fetchJson).mockResolvedValue({
      status: 200,
      data: [VALID_PROMOTION],
    });

    await scrape();

    expect(vi.mocked(fetchJson)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sleep)).not.toHaveBeenCalled();
  });

  it("sets sourceUrl to per-offer detail URL when id is present (AC5)", async () => {
    vi.mocked(fetchJson).mockResolvedValue({
      status: 200,
      data: [VALID_PROMOTION], // id: 101
    });

    const offers = await scrape();

    expect(offers[0].sourceUrl).toBe(
      "https://www.hnb.lk/personal/cards/credit-cards/promotions/101"
    );
  });

  it("falls back to generic SOURCE_URL when id is 0 (AC6)", async () => {
    vi.mocked(fetchJson).mockResolvedValue({
      status: 200,
      data: [PROMO_NO_ID], // id: 0
    });

    const offers = await scrape();

    expect(offers[0].sourceUrl).toBe(
      "https://www.hnb.lk/personal/cards/credit-cards"
    );
  });
});
