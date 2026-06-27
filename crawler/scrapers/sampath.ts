/**
 * Sampath Bank (sampath.lk) offer scraper
 * Spec: specs/features/002-crawler.md
 *
 * Uses the public REST API at sampath.lk/api/card-promotions.
 * The API requires a Referer header pointing to the offers page, otherwise it
 * returns "Request Rejected". fetchJson() adds a Referer via extraHeaders.
 *
 * Response shape:
 *   { data: SampathPromotion[] }
 *
 * Key fields per promotion:
 *   company_name    – merchant / partner name
 *   short_discount  – human-readable discount string ("15% off", "0% interest")
 *   category        – category string from Sampath's taxonomy (e.g. "dining",
 *                     "travel_and_leisure", "Electronics_and_Furniture")
 *   expire_on       – Unix timestamp in ms (offer end date)
 *   display_on      – Unix timestamp in ms (offer start date)
 *   image_url       – merchant logo / banner
 *   description     – HTML description of the offer
 *   cards_new       – array of { title, description (HTML), icon_url, order_id }
 *                     used to extract structured details (location, period, etc.)
 */
import { OfferInputSchema, type OfferInput } from "../../specs/data/offer.schema";
import { fetchJson } from "../utils/http";
import { parseDiscount } from "../utils/parseDiscount";

const API_URL =
  "https://www.sampath.lk/api/card-promotions?page_number=1&size=200";
const SOURCE_URL = "https://www.sampath.lk/sampath-cards/credit-card-offer";
const DETAIL_BASE = "https://www.sampath.lk/sampath-cards/credit-card-offer";

/**
 * The Sampath API requires a Referer pointing to the card offers page,
 * otherwise it responds with "Request Rejected" (HTML 200 but not JSON).
 */
const EXTRA_HEADERS = {
  Referer: "https://www.sampath.lk/sampath-cards/credit-card-offer",
};

/** Sampath category strings → our schema enum */
const CATEGORY_MAP: Record<string, OfferInput["category"]> = {
  // Dining / Food
  dining: "dining",
  food: "dining",
  restaurant: "dining",
  "food & beverage": "dining",

  // Shopping / Retail / Fashion / Electronics
  shopping: "shopping",
  fashion: "shopping",
  retail: "shopping",
  electronics_and_furniture: "shopping",

  // Travel / Hotels / Leisure
  travel: "travel",
  hotel: "travel",
  hotels: "travel",
  leisure: "travel",
  travel_and_leisure: "travel",

  // Fuel
  fuel: "fuel",
  petrol: "fuel",

  // Groceries / Supermarkets
  grocery: "groceries",
  groceries: "groceries",
  supermarket: "groceries",
  super_markets: "groceries",

  // Entertainment
  entertainment: "entertainment",
  cinema: "entertainment",

  // Healthcare
  health: "healthcare",
  pharmacy: "healthcare",
  medical: "healthcare",
  health_and_insurance: "healthcare",
  wellness: "wellness",

  // Online
  online: "online",
  "e-commerce": "online",

  // Card-type-specific promotions → keep as "other" (handled by detectCategoryFromText)
  // mastercard_offers, visa_offers, premium_offers, other → "other"
};

/**
 * Junk company_name values that are not real merchant offers — these are
 * generic category/card-type header entries inserted by Sampath's CMS.
 * Filtering is case-insensitive and checks for the key prefix phrases.
 */
const JUNK_NAME_PATTERNS = [
  /^exclusive offers for/i,
  /^offers for (visa|mastercard|sampath)/i,
];

/** Actual shape of items inside the cards_new array */
interface SampathCardEntry {
  title?: string;
  description?: string; // HTML content
  icon_url?: string;
  order_id?: number;
}

interface SampathPromotion {
  id?: number;
  company_name?: string;
  short_discount?: string;
  description?: string;   // HTML
  category?: string;
  expire_on?: number;     // Unix ms
  display_on?: number;    // Unix ms
  image_url?: string;
  cards_new?: SampathCardEntry[];
}

/**
 * Constructs a per-offer detail URL from the Sampath promotion id.
 * Returns undefined when id is absent, 0, or NaN so callers can fall back.
 */
function buildDetailUrl(id: number | undefined): string | undefined {
  if (!id || isNaN(id)) return undefined;
  return `${DETAIL_BASE}/${id}`;
}

// The API returns the list under a "data" key
type SampathApiResponse =
  | SampathPromotion[]
  | { data: SampathPromotion[] }
  | Record<string, unknown>;

export async function scrape(): Promise<OfferInput[]> {
  console.log("[sampath] Starting scrape…");
  const offers: OfferInput[] = [];

  try {
    const raw = await fetchJson<SampathApiResponse>(API_URL, 1000, 2, EXTRA_HEADERS);
    const promotions = extractPromotionList(raw);

    if (promotions.length === 0) {
      console.warn("[sampath] API returned 0 promotions — check response shape");
    }

    let skipped = 0;
    for (const item of promotions) {
      // Skip generic card-type header entries (not real merchant offers)
      const name = item.company_name?.trim() ?? "";
      if (JUNK_NAME_PATTERNS.some((re) => re.test(name))) {
        skipped++;
        continue;
      }

      const mapped = mapPromotion(item);
      const result = OfferInputSchema.safeParse(mapped);
      if (result.success) {
        offers.push(result.data);
      } else {
        console.warn(
          `[sampath] Offer "${name}" failed validation:`,
          result.error.flatten()
        );
      }
    }

    if (skipped > 0) {
      console.log(`[sampath] Skipped ${skipped} generic/junk entries`);
    }
  } catch (err) {
    console.error("[sampath] Scrape failed:", err);
    throw err;
  }

  console.log(`[sampath] Scraped ${offers.length} valid offers`);
  return offers;
}

/** Handle the various possible shapes of the API response */
function extractPromotionList(response: SampathApiResponse): SampathPromotion[] {
  if (Array.isArray(response)) return response as SampathPromotion[];

  const obj = response as Record<string, unknown>;
  for (const key of ["data", "promotions", "result", "items", "offers"]) {
    if (Array.isArray(obj[key])) return obj[key] as SampathPromotion[];
  }

  // Last resort: look for the first array-valued property
  for (const val of Object.values(obj)) {
    if (Array.isArray(val) && val.length > 0) return val as SampathPromotion[];
  }

  return [];
}

/**
 * Parse a Sampath timestamp into a Date.
 * The API returns Unix timestamps in milliseconds.
 */
function parseTimestamp(val: number | string | undefined | null): Date | undefined {
  if (val == null || val === 0 || val === "") return undefined;

  // Numeric string → convert to number first
  if (typeof val === "string" && /^\d+$/.test(val.trim())) {
    return new Date(parseInt(val, 10));
  }

  const d = new Date(val as string | number);
  return isNaN(d.getTime()) ? undefined : d;
}

function mapPromotion(item: SampathPromotion): Partial<OfferInput> {
  const merchant = item.company_name ? cleanText(item.company_name) : "Various";
  const discountText = item.short_discount ? cleanText(item.short_discount) : undefined;
  const category = mapCategory(item.category ?? "");

  // Build a descriptive title: "20% off at Merchant" or "Merchant" if no discount
  const title = discountText
    ? `${discountText} at ${merchant}`
    : merchant;

  const description = buildDescription(item);

  return {
    bank: "sampath_bank",
    bankDisplayName: "Sampath Bank",
    title,
    merchant,
    description,
    ...parseDiscount(discountText),
    category,
    merchantLogoUrl: item.image_url || undefined,
    validFrom: parseTimestamp(item.display_on),
    validUntil: parseTimestamp(item.expire_on),
    sourceUrl: buildDetailUrl(item.id) ?? SOURCE_URL,
    scrapedAt: new Date(),
  };
}

/**
 * Build a description from the cards_new structured entries.
 * Falls back to the top-level description HTML field if cards_new is absent.
 */
function buildDescription(item: SampathPromotion): string | undefined {
  // 1. Try structured cards_new entries first (more informative)
  if (item.cards_new?.length) {
    const lines: string[] = [];
    for (const card of item.cards_new) {
      if (!card.title || !card.description) continue;
      // Skip generic "Partner" entries — just repeats the merchant name
      if (/^partner$/i.test(card.title.trim())) continue;
      const value = cleanText(card.description);
      if (value) lines.push(`${card.title}: ${value}`);
    }
    if (lines.length) return lines.join(" | ").substring(0, 300);
  }

  // 2. Fall back to the main description field (HTML → plain text)
  if (item.description) {
    const cleaned = cleanText(item.description);
    if (cleaned) return cleaned.substring(0, 300);
  }

  return undefined;
}

function mapCategory(raw: string): OfferInput["category"] {
  const lower = raw.toLowerCase().trim().replace(/\s+/g, "_");

  // Exact match first (handles underscore-formatted Sampath categories)
  if (CATEGORY_MAP[lower]) return CATEGORY_MAP[lower];

  // Also try without underscores / spaces
  const withoutSeparators = lower.replace(/[_\s]/g, "");
  for (const [key, val] of Object.entries(CATEGORY_MAP)) {
    if (key.replace(/[_\s]/g, "") === withoutSeparators) return val;
  }

  // Partial substring match
  for (const [key, val] of Object.entries(CATEGORY_MAP)) {
    if (lower.includes(key.replace(/[_\s]/g, ""))) return val;
  }

  return detectCategoryFromText(raw);
}

function detectCategoryFromText(text: string): OfferInput["category"] {
  const lower = text.toLowerCase();
  if (/dining|restaurant|food|pizza|burger|cafe/.test(lower)) return "dining";
  if (/shopping|retail|fashion|cloth|electronics|furniture/.test(lower)) return "shopping";
  if (/travel|hotel|flight|airline|leisure/.test(lower)) return "travel";
  if (/fuel|petrol/.test(lower)) return "fuel";
  if (/grocery|supermarket/.test(lower)) return "groceries";
  if (/cinema|entertainment|movie/.test(lower)) return "entertainment";
  if (/hospital|pharmacy|health|medical|insurance/.test(lower)) return "healthcare";
  if (/online|e.commerce/.test(lower)) return "online";
  return "other";
}

function cleanText(text: string): string {
  return text
    .replace(/<[^>]+>/g, "")        // strip HTML tags
    .replace(/&amp;/g, "&")         // decode HTML entities
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, "")         // strip numeric entities
    .replace(/\s+/g, " ")
    .trim();
}
