/**
 * Sampath Bank scraper — unit tests
 * Spec: specs/features/002-crawler.md (AC1, AC2)
 * Spec: specs/features/036-sampath-per-offer-detail-url.md (AC1, AC2)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../utils/http", () => ({
  fetchJson: vi.fn(),
  sleep: vi.fn(),
}));

vi.mock("../utils/proxyProviders/registry", () => ({
  getConfiguredProviders: vi.fn().mockReturnValue([]),
  getBankProviderMap: vi.fn().mockReturnValue({}),
  orderedProvidersForBank: vi.fn().mockReturnValue([]),
}));

import { scrape } from "./sampath";
import { fetchJson } from "../utils/http";
import { orderedProvidersForBank } from "../utils/proxyProviders/registry";

/** Realistic promotion matching the actual Sampath API response shape */
const VALID_PROMOTION = {
  id: 1,
  company_name: "Pizza Hut",
  short_discount: "15% off",
  category: "dining",
  expire_on: 1775000000000,
  display_on: 1700000000000,
  image_url: "https://www.sampath.lk/images/pizza-hut.jpg",
  description: "<p>15% off at all Pizza Hut outlets.</p>",
  cards_new: [
    {
      title: "Promotion Period",
      description: "<span>Valid till 31st December 2025</span>",
      icon_url: "icon-calendar",
      order_id: 1,
    },
    {
      title: "Eligible Card Categories",
      description: "<span>Sampath Mastercard &amp; Visa Credit Cards</span>",
      icon_url: "icon-cards-4",
      order_id: 2,
    },
  ],
};

const TRAVEL_PROMOTION = {
  id: 2,
  company_name: "Earl's Regent Hotel",
  short_discount: "20% Discount",
  category: "hotels",
  expire_on: 1785522540000,
  display_on: 1778783400000,
  description: "<p>20% discount on room rates.</p>",
  cards_new: [],
};

const ELECTRONICS_PROMOTION = {
  id: 3,
  company_name: "Singhagiri Plaza",
  short_discount: "Up to 20 months 0% interest instalment plans",
  category: "Electronics_and_Furniture",
  expire_on: 1782844140000,
  display_on: 1778758200000,
};

// discountPercentage 200 exceeds OfferInputSchema max(100) → safeParse fails
const INVALID_PROMOTION = {
  id: 99,
  company_name: "Test Merchant",
  short_discount: "200% off",
  category: "shopping",
};

/** Generic junk entry that should be skipped */
const JUNK_VISA_ENTRY = {
  id: 10,
  company_name: "Exclusive Offers for Visa Cardholders",
  short_discount: "Exclusive privileges",
  category: "VISA_Offers",
  expire_on: 1775000000000,
  display_on: 1700000000000,
};

const JUNK_MASTERCARD_ENTRY = {
  id: 11,
  company_name: "Exclusive Offers for Mastercard Cardholders",
  short_discount: "Exclusive privileges",
  category: "Mastercard_Offers",
  expire_on: 1775000000000,
  display_on: 1700000000000,
};

describe("sampath scraper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(orderedProvidersForBank).mockReturnValue([]);
  });

  it("returns valid OfferInput objects with correct bank and title (AC1, AC2)", async () => {
    vi.mocked(fetchJson).mockResolvedValue({ data: [VALID_PROMOTION] });

    const offers = await scrape();

    expect(Array.isArray(offers)).toBe(true);
    expect(offers.length).toBeGreaterThan(0);
    expect(offers[0]).toMatchObject({
      bank: "sampath_bank",
      bankDisplayName: "Sampath Bank",
      merchant: "Pizza Hut",
      category: "dining",
      // id=1 → per-offer detail URL (spec 036 AC1)
      sourceUrl: "https://www.sampath.lk/sampath-cards/credit-card-offer/1",
    });
    // Title should be descriptive, not just the merchant name
    expect(offers[0].title).toContain("15% off");
    expect(offers[0].title).toContain("Pizza Hut");
  });

  it("maps hotels category to travel", async () => {
    vi.mocked(fetchJson).mockResolvedValue({ data: [TRAVEL_PROMOTION] });

    const offers = await scrape();

    expect(offers).toHaveLength(1);
    expect(offers[0].category).toBe("travel");
  });

  it("maps Electronics_and_Furniture category to shopping", async () => {
    vi.mocked(fetchJson).mockResolvedValue({ data: [ELECTRONICS_PROMOTION] });

    const offers = await scrape();

    expect(offers).toHaveLength(1);
    expect(offers[0].category).toBe("shopping");
  });

  it("skips junk Visa/Mastercard generic header entries (AC2)", async () => {
    vi.mocked(fetchJson).mockResolvedValue({
      data: [VALID_PROMOTION, JUNK_VISA_ENTRY, JUNK_MASTERCARD_ENTRY],
    });

    const offers = await scrape();

    // Only the real offer should pass through
    expect(offers).toHaveLength(1);
    expect(offers[0].merchant).toBe("Pizza Hut");
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

  it("mixes valid, junk and invalid offers, returning only clean valid ones", async () => {
    vi.mocked(fetchJson).mockResolvedValue({
      data: [VALID_PROMOTION, INVALID_PROMOTION, JUNK_VISA_ENTRY, ELECTRONICS_PROMOTION],
    });

    const offers = await scrape();

    // INVALID_PROMOTION fails Zod, JUNK_VISA_ENTRY is filtered, 2 valid remain
    expect(offers).toHaveLength(2);
    const merchants = offers.map((o) => o.merchant);
    expect(merchants).toContain("Pizza Hut");
    expect(merchants).toContain("Singhagiri Plaza");
  });

  it("builds description from cards_new entries (skipping generic Partner title)", async () => {
    vi.mocked(fetchJson).mockResolvedValue({ data: [VALID_PROMOTION] });

    const offers = await scrape();

    expect(offers[0].description).toBeDefined();
    // Should include structured detail entries
    expect(offers[0].description).toContain("Promotion Period");
    expect(offers[0].description).not.toMatch(/^Partner:/);
  });

  it("falls back to description field when cards_new is empty", async () => {
    vi.mocked(fetchJson).mockResolvedValue({ data: [TRAVEL_PROMOTION] });

    const offers = await scrape();

    expect(offers[0].description).toBeDefined();
    expect(offers[0].description).toContain("20% discount on room rates");
  });

  // spec 036 — per-offer detail URL
  it("sets sourceUrl to per-offer detail URL when id is present (spec 036 AC1)", async () => {
    const promotion = { ...VALID_PROMOTION, id: 42 };
    vi.mocked(fetchJson).mockResolvedValue({ data: [promotion] });

    const offers = await scrape();

    expect(offers[0].sourceUrl).toBe(
      "https://www.sampath.lk/sampath-cards/credit-card-offer/42"
    );
  });

  it("falls back to SOURCE_URL when id is undefined (spec 036 AC2)", async () => {
    const promotion = { ...VALID_PROMOTION, id: undefined };
    vi.mocked(fetchJson).mockResolvedValue({ data: [promotion] });

    const offers = await scrape();

    expect(offers[0].sourceUrl).toBe(
      "https://www.sampath.lk/sampath-cards/credit-card-offer"
    );
  });

  it("falls back to SOURCE_URL when id is 0 (spec 036 AC2)", async () => {
    const promotion = { ...VALID_PROMOTION, id: 0 };
    vi.mocked(fetchJson).mockResolvedValue({ data: [promotion] });

    const offers = await scrape();

    expect(offers[0].sourceUrl).toBe(
      "https://www.sampath.lk/sampath-cards/credit-card-offer"
    );
  });
  it("logs truncated raw response when API returns 0 promotions (062 AC1)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(fetchJson).mockResolvedValue({ data: [] });
    await scrape();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("API returned 0 promotions"));
    warnSpy.mockRestore();
  });
  it("truncates raw log at 2KB when response is large (062 AC1)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const large = { data: [], extra: "x".repeat(5000) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(fetchJson).mockResolvedValue(large as any);
    await scrape();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const call = warnSpy.mock.calls.find((c: any) => String(c[0]).includes("raw response"));
    expect(call).toBeDefined();
    warnSpy.mockRestore();
  });

  // 065 AC2: zero-result proxy fallback
  it("falls back to ZenRows proxy when direct returns 0 and proxy returns data (065 AC2)", async () => {
    vi.mocked(fetchJson).mockResolvedValue({ data: [] });
    const proxyData = { data: [VALID_PROMOTION] };
    const mockProvider = {
      name: "zenrows",
      fetchHtml: vi.fn().mockResolvedValue(JSON.stringify(proxyData)),
    };
    vi.mocked(orderedProvidersForBank).mockReturnValue([mockProvider as unknown as ReturnType<typeof orderedProvidersForBank>[number]]);
    const offers = await scrape();
    expect(mockProvider.fetchHtml).toHaveBeenCalledWith("https://www.sampath.lk/api/card-promotions?page_number=1&size=200", "sampath_bank");
    expect(offers).toHaveLength(1);
    expect(offers[0].merchant).toBe("Pizza Hut");
  });

  it("falls back to proxy when direct fetch throws (065 AC2)", async () => {
    vi.mocked(fetchJson).mockRejectedValue(new Error("network down"));
    const proxyData = { data: [VALID_PROMOTION] };
    const mockProvider = {
      name: "zenrows",
      fetchHtml: vi.fn().mockResolvedValue(JSON.stringify(proxyData)),
    };
    vi.mocked(orderedProvidersForBank).mockReturnValue([mockProvider as unknown as ReturnType<typeof orderedProvidersForBank>[number]]);
    const offers = await scrape();
    expect(mockProvider.fetchHtml).toHaveBeenCalled();
    expect(offers).toHaveLength(1);
  });

  it("does not crash when no proxy configured and direct returns 0 (065 edge)", async () => {
    vi.mocked(fetchJson).mockResolvedValue({ data: [] });
    vi.mocked(orderedProvidersForBank).mockReturnValue([]);
    const offers = await scrape();
    expect(offers).toHaveLength(0);
  });

  // 065 AC3: keep existing shapes working
  it("parses bare array and {data:[]} shapes without regression (065 AC3)", async () => {
    vi.mocked(fetchJson).mockResolvedValue([VALID_PROMOTION]);
    expect((await scrape()).length).toBeGreaterThan(0);
    vi.mocked(fetchJson).mockResolvedValue({ data: [VALID_PROMOTION] });
    expect((await scrape()).length).toBeGreaterThan(0);
    // third shape: { promotions: [...] } observed on 2026-08-13 empty/wrapped
    vi.mocked(fetchJson).mockResolvedValue({ promotions: [VALID_PROMOTION] } as unknown as Record<string, unknown>);
    expect((await scrape()).length).toBeGreaterThan(0);
  });

  it("proxy also returning 0 still surfaces as 0 not swallowed (065 edge)", async () => {
    vi.mocked(fetchJson).mockResolvedValue({ data: [] });
    const mockProvider = {
      name: "zenrows",
      fetchHtml: vi.fn().mockResolvedValue(JSON.stringify({ data: [] })),
    };
    vi.mocked(orderedProvidersForBank).mockReturnValue([mockProvider as unknown as ReturnType<typeof orderedProvidersForBank>[number]]);
    const offers = await scrape();
    expect(offers).toHaveLength(0);
  });
});
