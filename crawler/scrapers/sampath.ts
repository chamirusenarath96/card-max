/**
 * Sampath Bank (sampath.lk) offer scraper
 * Spec: specs/features/002-crawler.md
 *
 * Uses the public REST API at sampath.lk/api/card-promotions.
 * Response shape (discovered via network inspection):
 *   { data: SampathPromotion[] }  (or top-level array in some versions)
 *
 * Key fields per promotion:
 *   company_name    – merchant / partner name
 *   short_discount  – human-readable discount string ("15% off", "0% interest")
 *   category        – category string from Sampath's taxonomy
 *   expire_on       – Unix timestamp in ms (offer end date)
 *   display_on      – Unix timestamp in ms (offer start date)
 *   image_url       – merchant logo / banner
 *   cards_new       – array of { "Partner name", Location, "Promotion Period",
 *                               "Eligible Card Categories" }
 */
import { OfferInputSchema, type OfferInput } from "../../specs/data/offer.schema";
import { fetchJson } from "../utils/http";
import { parseDiscount } from "../utils/parseDiscount";

const API_URL =
  "https://www.sampath.lk/api/card-promotions?page_number=1&size=200";
const SOURCE_URL = "https://www.sampath.lk/sampath-cards/credit-card-offer";

/** Sampath category strings → our schema enum */
const CATEGORY_MAP: Record<string, OfferInput["category"]> = {
  dining: "dining",
  food: "dining",
  restaurant: "dining",
  "food & beverage": "dining",
  shopping: "shopping",
  fashion: "shopping",
  retail: "shopping",
  travel: "travel",
  hotel: "travel",
  leisure: "travel",
  fuel: "fuel",
  petrol: "fuel",
  grocery: "groceries",
  groceries: "groceries",
  supermarket: "groceries",
  entertainment: "entertainment",
  cinema: "entertainment",
  health: "healthcare",
  pharmacy: "healthcare",
  medical: "healthcare",
  wellness: "wellness",
  online: "online",
  "e-commerce": "online",
};

interface SampathCardEntry {
  "Partner name"?: string;
  Location?: string;
  "Promotion Period"?: string;
  "Eligible Card Categories"?: string;
}

interface SampathPromotion {
  id?: number;
  company_name?: string;
  short_discount?: string;
  category?: string;
  expire_on?: number; // Unix ms
  display_on?: number; // Unix ms
  image_url?: string;
  cards_new?: SampathCardEntry[];
}

// The API may return the list under different top-level keys
type SampathApiResponse =
  | SampathPromotion[]
  | { data: SampathPromotion[] }
  | { promotions: SampathPromotion[] }
  | { result: SampathPromotion[] }
  | Record<string, unknown>;

export async function scrape(): Promise<OfferInput[]> {
  console.log("[sampath] Starting scrape…");
  const offers: OfferInput[] = [];

  try {
    const raw = await fetchJson<SampathApiResponse>(API_URL);
    const promotions = extractPromotionList(raw);

    if (promotions.length === 0) {
      console.warn("[sampath] API returned 0 promotions — check response shape");
    }

    for (const item of promotions) {
      const mapped = mapPromotion(item);
      const result = OfferInputSchema.safeParse(mapped);
      if (result.success) {
        offers.push(result.data);
      } else {
        console.warn("[sampath] Offer failed validation:", result.error.flatten());
      }
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
 * The API may return:
 *   - a number  (Unix ms): 1700000000000
 *   - a numeric string: "1700000000000"  ← new Date("...") = Invalid Date!
 *   - an ISO string: "2026-12-31T18:30:00.000Z"
 * We must detect the numeric-string case and convert it to a number first.
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
  const category = mapCategory(item.category ?? "");
  const description = buildDescription(item);

  return {
    bank: "sampath_bank",
    bankDisplayName: "Sampath Bank",
    title: merchant,
    merchant,
    description,
    ...parseDiscount(item.short_discount ? cleanText(item.short_discount) : undefined),
    category,
    merchantLogoUrl: item.image_url || undefined,
    validFrom: parseTimestamp(item.display_on),
    validUntil: parseTimestamp(item.expire_on),
    sourceUrl: SOURCE_URL,
    scrapedAt: new Date(),
  };
}

/** Build a description from cards_new entries if available */
function buildDescription(item: SampathPromotion): string | undefined {
  if (!item.cards_new?.length) return undefined;

  const lines: string[] = [];
  for (const card of item.cards_new.slice(0, 3)) {
    const parts: string[] = [];
    if (card["Partner name"]) parts.push(card["Partner name"]);
    if (card["Promotion Period"]) parts.push(`Period: ${card["Promotion Period"]}`);
    if (card["Eligible Card Categories"]) parts.push(`Cards: ${card["Eligible Card Categories"]}`);
    if (parts.length) lines.push(parts.join(" | "));
  }

  return lines.join("; ").substring(0, 300) || undefined;
}

function mapCategory(raw: string): OfferInput["category"] {
  const lower = raw.toLowerCase().trim();

  // Exact match first
  if (CATEGORY_MAP[lower]) return CATEGORY_MAP[lower];

  // Partial match
  for (const [key, val] of Object.entries(CATEGORY_MAP)) {
    if (lower.includes(key)) return val;
  }

  return detectCategoryFromText(raw);
}

function detectCategoryFromText(text: string): OfferInput["category"] {
  const lower = text.toLowerCase();
  if (/dining|restaurant|food|pizza|burger|cafe/.test(lower)) return "dining";
  if (/shopping|retail|fashion|cloth/.test(lower)) return "shopping";
  if (/travel|hotel|flight|airline/.test(lower)) return "travel";
  if (/fuel|petrol/.test(lower)) return "fuel";
  if (/grocery|supermarket/.test(lower)) return "groceries";
  if (/cinema|entertainment|movie/.test(lower)) return "entertainment";
  if (/hospital|pharmacy|health|medical/.test(lower)) return "healthcare";
  if (/online|e.commerce/.test(lower)) return "online";
  return "other";
}

function cleanText(text: string): string {
  return text.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}
