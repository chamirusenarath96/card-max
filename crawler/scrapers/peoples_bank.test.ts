/**
 * People's Bank scraper — unit tests
 * Spec: specs/features/011-new-banks.md
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../utils/http", () => ({
  fetchHtml: vi.fn(),
  sleep: vi.fn(),
}));

import { scrape, stripUiChrome } from "./peoples_bank";
import { fetchHtml } from "../utils/http";

// ── HTML fixtures ────────────────────────────────────────────────────────────

/** Current People's Bank site structure (2026): <article class="offer-card"> */
const OFFER_CARD_HTML = `
<!DOCTYPE html><html><body>
<section>
  <article class="offer-card" role="article">
    <div class="discount-badge">30%</div>
    <div class="offer-image">
      <a href="https://www.peoplesbank.lk/promotion/keells-30-off-credit/"
         onclick="window.open(this.href, '_blank'); return false;"
         style="display: block; width: 100%; height: 100%;">
        <img src="https://www.peoplesbank.lk/roastoth/2023/03/keels.jpg"
             alt="Keells – 30% off – Credit" />
      </a>
    </div>
    <div class="card-content">
      <div>
        <a href="https://www.peoplesbank.lk/promotion/keells-30-off-credit/"
           style="text-decoration: none; color: inherit;">
          <div class="promo-short fw-medium">Keells</div>
        </a>
        <div class="meta">
          <a href="https://www.peoplesbank.lk/promotion/keells-30-off-credit/"
             style="text-decoration: none; color: inherit;">
            <span class="merchant-name">
              30% off on Fresh Vegetables, Fruit, Seafood &amp; Fresh Meat
              Minimum Bill Value - Rs.4,000/-
              Maximum Discount - Rs.1,000/-
            </span>
          </a>
        </div>
      </div>
    </div>
  </article>
  <article class="offer-card" role="article">
    <div class="discount-badge">25%</div>
    <div class="offer-image">
      <a href="https://www.peoplesbank.lk/promotion/glomark-25/">
        <img src="https://www.peoplesbank.lk/roastoth/glomark.jpg" alt="Glomark" />
      </a>
    </div>
    <div class="card-content">
      <div class="promo-short fw-medium">Softlogic Glomark</div>
      <div class="meta">
        <span class="merchant-name">25% off on fresh produce. Min bill Rs.2,500/-</span>
      </div>
    </div>
  </article>
</section>
</body></html>
`;

/** Page with "No Promotions Available" message — should produce zero offers */
const NO_PROMOTIONS_HTML = `
<!DOCTYPE html><html><body>
<section>
  <h2>No Promotions Available</h2>
  <p>There are currently no active promotions in this category.</p>
</section>
</body></html>
`;

/** Merchants matching the old "lodging"/"clothing" keyword patterns (spec 048) */
const CONSOLIDATED_CATEGORY_HTML = `
<!DOCTYPE html><html><body>
<section>
  <article class="offer-card" role="article">
    <div class="discount-badge">20%</div>
    <div class="offer-image">
      <a href="https://www.peoplesbank.lk/promotion/city-hotel-20-off/">
        <img src="https://www.peoplesbank.lk/roastoth/hotel.jpg" alt="City Hotel" />
      </a>
    </div>
    <div class="card-content">
      <div class="promo-short fw-medium">City Hotel</div>
      <div class="meta">
        <span class="merchant-name">Enjoy a relaxing stay at our resort</span>
      </div>
    </div>
  </article>
  <article class="offer-card" role="article">
    <div class="discount-badge">15%</div>
    <div class="offer-image">
      <a href="https://www.peoplesbank.lk/promotion/fashion-trends-15-off/">
        <img src="https://www.peoplesbank.lk/roastoth/fashion.jpg" alt="Fashion Trends" />
      </a>
    </div>
    <div class="card-content">
      <div class="promo-short fw-medium">Fashion Trends</div>
      <div class="meta">
        <span class="merchant-name">15% off on clothing and apparel</span>
      </div>
    </div>
  </article>
</section>
</body></html>
`;

/**
 * Page with staff-directory popup modals (sgpb-main-popup-data-container).
 * The popup divs contain Tamil-script manager names in <h2> elements.
 * These must be stripped before parsing — not returned as merchant names.
 */
const STAFF_POPUP_HTML = `
<!DOCTYPE html><html><body>
<main><p>No credit card promotions in this category.</p></main>
<div class="sgpb-main-popup-data-container-9395" style="position:fixed;opacity:0;filter:opacity(0%);">
  <h1>உதவிப் பொது முகாமையாளர் - கிளை முகாமைத்துவம்</h1>
  <h2 style="font-family: sansation-Bold;">திரு.சுஜீவ ராஜபக்</h2>
  <h7>Tel: 0112055840 Email: shantha@peoplesbank.lk</h7>
</div>
<div class="sgpb-main-popup-data-container-9244" style="position:fixed;opacity:0;filter:opacity(0%);">
  <h2 style="font-family: sansation-Bold;">திரு. குமார் குணவர்தன</h2>
  <h7>Tel: 0112481388 Email: ravikaran@peoplesbank.lk</h7>
</div>
</body></html>
`;

/** Legacy .promotion-card structure — exercises the legacy fallback path */
const LEGACY_CARD_HTML = `
<!DOCTYPE html><html><body>
<div class="promotion-card">
  <span class="discount-badge">15% off</span>
  <img src="https://www.peoplesbank.lk/images/pizza-hut.jpg" alt="Pizza Hut">
  <h3><a href="/pizza-hut-offer">Pizza Hut</a></h3>
  <p>Enjoy 15% discount on dine-in and takeaway orders.</p>
  <p>Valid till 31 December 2026</p>
</div>
</body></html>
`;

/** Heading-based layout (last-resort fallback) */
const HEADING_HTML = `
<!DOCTYPE html><html><body>
  <main>
    <h3>Buy 1 Get 1 Free at Barista Coffee</h3>
    <p>Complimentary coffee for People's Bank cardholders. Valid till 31 March 2026.</p>
  </main>
</body></html>
`;

/**
 * Current offer-card structure with a trailing "...See more" UI-chrome fragment
 * baked into the .merchant-name span text, matching the live peoplesbank.lk markup
 * (spec 050 / issue #90).
 */
const OFFER_CARD_SEE_MORE_HTML = `
<!DOCTYPE html><html><body>
<section>
  <article class="offer-card" role="article">
    <div class="discount-badge">30%</div>
    <div class="offer-image">
      <a href="https://www.peoplesbank.lk/promotion/keells-30-off-credit/">
        <img src="https://www.peoplesbank.lk/roastoth/2023/03/keels.jpg" alt="Keells" />
      </a>
    </div>
    <div class="card-content">
      <div class="promo-short fw-medium">Keells</div>
      <div class="meta">
        <span class="merchant-name">
          30% off on Fresh Vegetables, Fruit, Seafood &amp; Fresh Meat
          One Transaction Per Card, Per day <span style="color: red; font-weight: 700;">...See more</span>
        </span>
      </div>
    </div>
  </article>
</section>
</body></html>
`;

/** Legacy .promotion-card structure with a trailing "Read more" fragment (AC1, AC3) */
const LEGACY_CARD_READ_MORE_HTML = `
<!DOCTYPE html><html><body>
<div class="promotion-card">
  <span class="discount-badge">15% off</span>
  <img src="https://www.peoplesbank.lk/images/pizza-hut.jpg" alt="Pizza Hut">
  <h3><a href="/pizza-hut-offer">Pizza Hut</a></h3>
  <p>Enjoy 15% discount on dine-in and takeaway orders. Read more</p>
  <p>Valid till 31 December 2026</p>
</div>
</body></html>
`;

/** Heading-based layout with a trailing "View more" fragment (AC2, AC3) */
const HEADING_VIEW_MORE_HTML = `
<!DOCTYPE html><html><body>
  <main>
    <h3>Buy 1 Get 1 Free at Barista Coffee</h3>
    <p>Complimentary coffee for People's Bank cardholders. View more</p>
  </main>
</body></html>
`;

// ── Tests ────────────────────────────────────────────────────────────────────

describe("peoples_bank scraper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns offers with bank=peoples_bank and correct bankDisplayName", async () => {
    vi.mocked(fetchHtml).mockResolvedValueOnce(OFFER_CARD_HTML);
    vi.mocked(fetchHtml).mockResolvedValue(NO_PROMOTIONS_HTML);

    const offers = await scrape();

    expect(offers.length).toBeGreaterThan(0);
    offers.forEach((o) => {
      expect(o.bank).toBe("peoples_bank");
      expect(o.bankDisplayName).toBe("People's Bank");
    });
  });

  it("parses merchant name from .promo-short and builds descriptive title", async () => {
    vi.mocked(fetchHtml).mockResolvedValueOnce(OFFER_CARD_HTML);
    vi.mocked(fetchHtml).mockResolvedValue(NO_PROMOTIONS_HTML);

    const offers = await scrape();

    const keells = offers.find((o) => o.merchant === "Keells");
    expect(keells).toBeDefined();
    expect(keells!.title).toContain("30%");
    expect(keells!.title).toContain("Keells");
  });

  it("extracts discount badge and classifies offer type correctly", async () => {
    vi.mocked(fetchHtml).mockResolvedValueOnce(OFFER_CARD_HTML);
    vi.mocked(fetchHtml).mockResolvedValue(NO_PROMOTIONS_HTML);

    const offers = await scrape();

    const keells = offers.find((o) => o.merchant === "Keells");
    expect(keells?.offerType).toBe("percentage");
    expect(keells?.discountPercentage).toBe(30);
  });

  it("extracts merchant logo URL and source URL from offer-image link", async () => {
    vi.mocked(fetchHtml).mockResolvedValueOnce(OFFER_CARD_HTML);
    vi.mocked(fetchHtml).mockResolvedValue(NO_PROMOTIONS_HTML);

    const offers = await scrape();

    const keells = offers.find((o) => o.merchant === "Keells");
    expect(keells?.merchantLogoUrl).toContain("keels.jpg");
    expect(keells?.sourceUrl).toContain("peoplesbank.lk/promotion/");
  });

  it("extracts description from .merchant-name span", async () => {
    vi.mocked(fetchHtml).mockResolvedValueOnce(OFFER_CARD_HTML);
    vi.mocked(fetchHtml).mockResolvedValue(NO_PROMOTIONS_HTML);

    const offers = await scrape();

    const keells = offers.find((o) => o.merchant === "Keells");
    expect(keells?.description).toBeDefined();
    expect(keells?.description).toContain("Vegetables");
  });

  it("parses multiple offer-card articles from a single page", async () => {
    vi.mocked(fetchHtml).mockResolvedValueOnce(OFFER_CARD_HTML);
    vi.mocked(fetchHtml).mockResolvedValue(NO_PROMOTIONS_HTML);

    const offers = await scrape();

    const merchants = offers.map((o) => o.merchant);
    expect(merchants).toContain("Keells");
    expect(merchants).toContain("Softlogic Glomark");
  });

  it("returns 0 offers when page shows 'No Promotions Available'", async () => {
    vi.mocked(fetchHtml).mockResolvedValue(NO_PROMOTIONS_HTML);

    const offers = await scrape();

    expect(offers).toHaveLength(0);
  });

  it("strips staff popup modals and does not produce Tamil-script merchant names", async () => {
    vi.mocked(fetchHtml).mockResolvedValue(STAFF_POPUP_HTML);

    const offers = await scrape();

    // No Tamil/Sinhala-script names should appear as merchant names
    for (const offer of offers) {
      expect(/[஀-௿඀-෿]/.test(offer.merchant)).toBe(false);
    }
    // The page has no actual offers
    expect(offers).toHaveLength(0);
  });

  it("falls back to legacy .promotion-card parsing when no article cards found", async () => {
    vi.mocked(fetchHtml).mockResolvedValueOnce(LEGACY_CARD_HTML);
    vi.mocked(fetchHtml).mockResolvedValue(NO_PROMOTIONS_HTML);

    const offers = await scrape();

    expect(offers.length).toBeGreaterThan(0);
    expect(offers.find((o) => o.merchant === "Pizza Hut")).toBeDefined();
  });

  it("falls back to heading-based parsing as last resort", async () => {
    vi.mocked(fetchHtml).mockResolvedValueOnce(HEADING_HTML);
    vi.mocked(fetchHtml).mockResolvedValue(NO_PROMOTIONS_HTML);

    const offers = await scrape();

    expect(offers.length).toBeGreaterThan(0);
    expect(offers[0]?.bank).toBe("peoples_bank");
  });

  it("deduplicates same offer seen across multiple category pages", async () => {
    // Same offer-card HTML returned for two categories
    vi.mocked(fetchHtml).mockResolvedValueOnce(OFFER_CARD_HTML);
    vi.mocked(fetchHtml).mockResolvedValueOnce(OFFER_CARD_HTML);
    vi.mocked(fetchHtml).mockResolvedValue(NO_PROMOTIONS_HTML);

    const offers = await scrape();

    const keellsOffers = offers.filter((o) => o.merchant === "Keells");
    expect(keellsOffers.length).toBe(1);
  });

  it("handles HTTP errors per category gracefully and continues", async () => {
    vi.mocked(fetchHtml).mockRejectedValueOnce(new Error("HTTP 503"));
    vi.mocked(fetchHtml).mockResolvedValueOnce(OFFER_CARD_HTML);
    vi.mocked(fetchHtml).mockResolvedValue(NO_PROMOTIONS_HTML);

    const offers = await scrape();

    // Gets offers from second category despite first failing
    expect(offers.length).toBeGreaterThan(0);
  });

  it("detects groceries category for supermarket merchants", async () => {
    vi.mocked(fetchHtml).mockResolvedValueOnce(OFFER_CARD_HTML);
    vi.mocked(fetchHtml).mockResolvedValue(NO_PROMOTIONS_HTML);

    const offers = await scrape();

    const keells = offers.find((o) => o.merchant === "Keells");
    expect(keells?.category).toBe("groceries");
  });

  // spec 048 — "lodging" and "clothing" were merged into "travel" and "shopping"
  it("classifies hotel/resort merchants as travel, not the removed lodging category", async () => {
    vi.mocked(fetchHtml).mockResolvedValueOnce(CONSOLIDATED_CATEGORY_HTML);
    vi.mocked(fetchHtml).mockResolvedValue(NO_PROMOTIONS_HTML);

    const offers = await scrape();

    const hotel = offers.find((o) => o.merchant === "City Hotel");
    expect(hotel?.category).toBe("travel");
  });

  it("classifies clothing/apparel merchants as shopping, not the removed clothing category", async () => {
    vi.mocked(fetchHtml).mockResolvedValueOnce(CONSOLIDATED_CATEGORY_HTML);
    vi.mocked(fetchHtml).mockResolvedValue(NO_PROMOTIONS_HTML);

    const offers = await scrape();

    const fashion = offers.find((o) => o.merchant === "Fashion Trends");
    expect(fashion?.category).toBe("shopping");
  });

  // spec 050 / issue #90 — strip "See more"/"Read more"/"View more" UI-chrome
  describe("stripUiChrome (spec 050 / issue #90)", () => {
    it("strips a trailing '...See more' fragment", () => {
      expect(stripUiChrome("Per day ...See more")).toBe("Per day");
    });

    it("strips 'Read more' and 'View more' trailing fragments the same way (AC3)", () => {
      expect(stripUiChrome("Enjoy 15% discount on dine-in. Read more")).toBe(
        "Enjoy 15% discount on dine-in",
      );
      expect(stripUiChrome("Complimentary coffee for cardholders. View more")).toBe(
        "Complimentary coffee for cardholders",
      );
    });

    it("is case-insensitive and tolerates trailing punctuation/symbols", () => {
      expect(stripUiChrome("Some offer text See More")).toBe("Some offer text");
      expect(stripUiChrome("Some offer text See more...")).toBe("Some offer text");
      expect(stripUiChrome("Some offer text see more »")).toBe("Some offer text");
    });

    it("does not strip 'more' when it's part of normal description text (AC4)", () => {
      expect(stripUiChrome("Enjoy this offer and more categories")).toBe(
        "Enjoy this offer and more categories",
      );
      expect(stripUiChrome("Up to 45% off and more")).toBe("Up to 45% off and more");
    });

    it("returns an empty string when the entire input is a chrome fragment", () => {
      expect(stripUiChrome("...See more")).toBe("");
    });

    it("is a no-op on text with no chrome fragment", () => {
      expect(stripUiChrome("Complimentary dessert with any main course")).toBe(
        "Complimentary dessert with any main course",
      );
    });
  });

  it("strips trailing '...See more' from .merchant-name description in parseViaOfferArticles (issue #90)", async () => {
    vi.mocked(fetchHtml).mockResolvedValueOnce(OFFER_CARD_SEE_MORE_HTML);
    vi.mocked(fetchHtml).mockResolvedValue(NO_PROMOTIONS_HTML);

    const offers = await scrape();

    const keells = offers.find((o) => o.merchant === "Keells");
    expect(keells?.description).toBeDefined();
    expect(keells!.description!.toLowerCase()).not.toContain("see more");
    expect(keells!.description).toContain("Per day");
  });

  it("strips trailing 'Read more' from description in parseViaPromotionCards (AC1)", async () => {
    vi.mocked(fetchHtml).mockResolvedValueOnce(LEGACY_CARD_READ_MORE_HTML);
    vi.mocked(fetchHtml).mockResolvedValue(NO_PROMOTIONS_HTML);

    const offers = await scrape();

    const pizzaHut = offers.find((o) => o.merchant === "Pizza Hut");
    expect(pizzaHut?.description).toBeDefined();
    expect(pizzaHut!.description!.toLowerCase()).not.toContain("read more");
    expect(pizzaHut!.description).toContain("takeaway orders");
  });

  it("strips trailing 'View more' from description in parseViaHeadings fallback (AC2)", async () => {
    vi.mocked(fetchHtml).mockResolvedValueOnce(HEADING_VIEW_MORE_HTML);
    vi.mocked(fetchHtml).mockResolvedValue(NO_PROMOTIONS_HTML);

    const offers = await scrape();

    expect(offers.length).toBeGreaterThan(0);
    const description = offers[0]?.description;
    expect(description).toBeDefined();
    expect(description!.toLowerCase()).not.toContain("view more");
    expect(description).toContain("Complimentary coffee");
  });
});
