/**
 * Hatton National Bank (hnb.lk) offer scraper
 * Spec: specs/features/002-crawler.md
 *
 * Uses the public REST API at venus.hnb.lk.
 * Response: { status: 200, data: HnbPromotion[] }
 * Each promotion has: id, title, thumbUrl, from (YYYY-MM-DD), to (YYYY-MM-DD),
 *   card_type ("credit"|"debit"|"credit/debit"), content (HTML)
 */
import { OfferInputSchema, type OfferInput } from "../../specs/data/offer.schema";
import { fetchJson } from "../utils/http";
import { parseDiscount } from "../utils/parseDiscount";

const API_URL = "https://venus.hnb.lk/api/get_all_pcard_promotions";
const SOURCE_URL = "https://www.hnb.lk/personal/cards/credit-cards";

interface HnbPromotion {
  id: number;
  title: string;
  thumbUrl: string;
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
  card_type: string; // "credit" | "debit" | "credit/debit"
  content: string; // HTML with offer details
}

interface HnbApiResponse {
  status: number;
  data: HnbPromotion[];
}

export async function scrape(): Promise<OfferInput[]> {
  console.log("[hnb] Starting scrape…");
  const offers: OfferInput[] = [];

  try {
    const response = await fetchJson<HnbApiResponse>(API_URL);

    if (response.status !== 200 || !Array.isArray(response.data)) {
      throw new Error(`Unexpected API response: status=${response.status}`);
    }

    for (const item of response.data) {
      // Only include credit card promotions
      if (item.card_type && !item.card_type.toLowerCase().includes("credit")) {
        continue;
      }

      const raw = mapPromotion(item);
      const result = OfferInputSchema.safeParse(raw);
      if (result.success) {
        offers.push(result.data);
      } else {
        console.warn("[hnb] Offer failed validation:", result.error.flatten());
      }
    }
  } catch (err) {
    console.error("[hnb] Scrape failed:", err);
    throw err;
  }

  console.log(`[hnb] Scraped ${offers.length} valid offers`);
  return offers;
}

function mapPromotion(item: HnbPromotion): Partial<OfferInput> {
  const title = cleanText(item.title);
  const merchant = extractMerchant(title);
  const discountValue = extractDiscount(item.content);
  const description = extractDescription(item.content);
  const category = detectCategory(title, item.content);

  return {
    bank: "hnb",
    bankDisplayName: "Hatton National Bank",
    title,
    merchant,
    description,
    ...parseDiscount(discountValue),
    category,
    merchantLogoUrl: item.thumbUrl || undefined,
    validFrom: parseApiDate(item.from),
    validUntil: parseApiDate(item.to),
    sourceUrl: SOURCE_URL,
    scrapedAt: new Date(),
  };
}

/** Parse YYYY-MM-DD from the API */
function parseApiDate(dateStr: string): Date | undefined {
  if (!dateStr) return undefined;
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? undefined : date;
}

/**
 * Extract a merchant name from the promotion title.
 * Handles patterns like:
 *   "15% discount at Pizza Hut" → "Pizza Hut"
 *   "Special offer at Keells Super" → "Keells Super"
 *   "Dining offer at Blue Lotus Hotel" → "Blue Lotus Hotel"
 */
function extractMerchant(title: string): string {
  const atMatch = title.match(/\bat\s+(.+?)(?:\s+with\b|\s+for\b|\s+on\b|\s+–|\s+-|,|$)/i);
  if (atMatch) return cleanText(atMatch[1]).substring(0, 100);

  const withMatch = title.match(/\bwith\s+(.+?)(?:\s+with\b|\s+credit|\s+debit|,|$)/i);
  if (withMatch) return cleanText(withMatch[1]).substring(0, 100);

  return title.substring(0, 80);
}

/** Extract discount value from HTML content */
function extractDiscount(content: string): string | undefined {
  const text = stripHtml(content);
  const match = text.match(
    /(up\s+to\s+[\d]+%|[\d]+%\s+(?:off|discount|cashback|savings?)|[\d]+%)/i
  );
  return match ? match[0].trim() : undefined;
}

/** Extract a short description from HTML content */
function extractDescription(content: string): string | undefined {
  const text = stripHtml(content);
  if (!text) return undefined;
  return text.substring(0, 300).trim() || undefined;
}

/** Map content to a category */
function detectCategory(title: string, content: string): OfferInput["category"] {
  const text = `${title} ${stripHtml(content)}`.toLowerCase();
  if (/dining|restaurant|food|pizza|burger|cafe|bistro|eatery/.test(text)) return "dining";
  if (/hotel|resort|accommodation|stay|travel|flight|airline|holiday/.test(text)) return "travel";
  if (/fuel|petrol|gas\s+station|petroleum/.test(text)) return "fuel";
  if (/grocery|supermarket|keells|cargills|laugfs/.test(text)) return "groceries";
  if (/cinema|entertainment|movie|theme\s+park/.test(text)) return "entertainment";
  if (/hospital|pharmacy|health|medical|wellness|clinic/.test(text)) return "health";
  if (/online|e-commerce|digital|web\s+store/.test(text)) return "online";
  if (/shopping|retail|fashion|clothing|apparel|boutique/.test(text)) return "shopping";
  return "other";
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function cleanText(text: string): string {
  return stripHtml(text).replace(/\s+/g, " ").trim();
}
