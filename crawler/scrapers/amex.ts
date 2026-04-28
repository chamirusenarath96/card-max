/**
 * American Express NTB (americanexpress.lk) offer scraper
 * Spec: specs/features/010-amex-offers.md
 *
 * The americanexpress.lk site is server-side rendered — plain HTTP works.
 * Offers are organised by category pages under /en/offers/<category>.
 *
 * Strategy:
 *   1. Fetch each known category listing page
 *   2. Parse offer blocks: merchant (.alloffer-heading), discount (.value-limit span),
 *      validity text, and detail URL (<a> wrapping the card)
 *   3. On any error: log warning and return [] — never crash the crawl
 */
import { OfferInputSchema, type OfferInput } from "../../specs/data/offer.schema";
import { parseDiscount } from "../utils/parseDiscount";
import { fetchHtmlSessioned, sleep } from "../utils/http";

const BASE_URL = "https://www.americanexpress.lk";

// Known category listing URLs — all publicly accessible via plain HTTP
const CATEGORY_URLS: Array<{ url: string; category: OfferInput["category"] }> = [
  { url: `${BASE_URL}/en/offers/dining-offers`, category: "dining" },
  { url: `${BASE_URL}/en/offers/wellness-offers`, category: "wellness" },
  { url: `${BASE_URL}/en/offers/supermarket-offers`, category: "groceries" },
  { url: `${BASE_URL}/en/offers/lodging-offers`, category: "lodging" },
  { url: `${BASE_URL}/en/offers/homecare-offers`, category: "homecare" },
  { url: `${BASE_URL}/en/offers/clothing-offers`, category: "clothing" },
  { url: `${BASE_URL}/en/offers/online-offers`, category: "online" },
  { url: `${BASE_URL}/en/offers/travel-offers`, category: "travel" },
  { url: `${BASE_URL}/en/offers/healthcare`, category: "healthcare" },
  { url: `${BASE_URL}/en/offers/installment-offers`, category: "installments" },
  { url: `${BASE_URL}/en/offers/special-offers`, category: "other" },
];

const MONTH_MAP: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4,
  may: 5, june: 6, july: 7, august: 8,
  september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4,
  jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

export async function scrape(): Promise<OfferInput[]> {
  console.log("[amex] Starting scrape via HTTP…");

  const allOffers: OfferInput[] = [];
  const seen = new Set<string>(); // deduplicate by sourceUrl
  const cookieJar = new Map<string, string>();

  try {
    for (const { url: categoryUrl, category: defaultCategory } of CATEGORY_URLS) {
      await sleep(500);
      try {
        const html = await fetchHtmlSessioned(categoryUrl, cookieJar, BASE_URL, 0);

        if (isBlockPage(html) || isErrorPage(html)) {
          console.warn(`[amex] Category page unavailable: ${categoryUrl}`);
          continue;
        }

        const cards = parseOfferCards(html);
        console.log(`[amex] ${categoryUrl}: ${cards.length} offer cards`);

        for (const card of cards) {
          const sourceUrl = card.detailUrl || categoryUrl;
          if (seen.has(sourceUrl)) continue;
          seen.add(sourceUrl);

          const discount = parseDiscount(card.discountText || undefined);
          const { validFrom, validUntil } = extractDates(card.validityText);
          const category = detectCategory(card.merchant, card.discountText) ?? defaultCategory;

          const raw: Partial<OfferInput> = {
            bank: "amex_ntb",
            bankDisplayName: "American Express (NTB)",
            title: card.merchant.substring(0, 300),
            merchant: card.merchant.substring(0, 200),
            merchantLogoUrl: card.imageUrl || undefined,
            ...discount,
            category,
            validFrom,
            validUntil,
            sourceUrl,
            scrapedAt: new Date(),
          };

          const result = OfferInputSchema.safeParse(raw);
          if (result.success) {
            allOffers.push(result.data);
          } else {
            console.warn("[amex] Offer failed validation:", result.error.flatten());
          }
        }
      } catch (err) {
        console.warn(`[amex] Failed to fetch ${categoryUrl}:`, (err as Error).message);
      }
    }
  } catch (err) {
    console.error("[amex] Scrape failed:", err);
    return [];
  }

  console.log(`[amex] Scraped ${allOffers.length} valid offers`);
  return allOffers;
}

// ── HTML parsing helpers ─────────────────────────────────────────────────────

function isBlockPage(html: string): boolean {
  // Only check for the actual Incapsula block/incident page.
  // "_Incapsula_Resource" appears in CDN scripts on legitimate pages — do NOT check it.
  return html.includes("Incapsula incident ID");
}

function isErrorPage(html: string): boolean {
  return html.includes("General Error") || html.includes("Sorry, Something went wrong");
}

type OfferCard = {
  merchant: string;
  discountText: string;
  validityText: string;
  detailUrl: string;
  imageUrl: string;
};

/**
 * Parse offer cards from a category listing page.
 * Each card follows: .alloffer-box > a.alloffer-box-inner > .alloffer-text > .alloffer-heading
 */
function parseOfferCards(html: string): OfferCard[] {
  const cards: OfferCard[] = [];

  // Match each alloffer-box block
  const boxRe = /<div[^>]*class="[^"]*alloffer-box[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?=<div[^>]*class="[^"]*alloffer-box|<\/div>)/gi;

  // Simpler approach: extract all .alloffer-heading merchants and pair with surrounding context
  const merchantRe = /alloffer-heading">\s*([\s\S]*?)\s*<\/div>/gi;
  let m: RegExpExecArray | null;

  while ((m = merchantRe.exec(html)) !== null) {
    const merchant = cleanText(m[1]!);
    if (!merchant || merchant.length < 2) continue;

    // Extract surrounding block (2000 chars before and after the heading for context)
    const blockStart = Math.max(0, m.index - 1500);
    const blockEnd = Math.min(html.length, m.index + 500);
    const block = html.substring(blockStart, blockEnd);

    // Extract discount from value-limit span immediately before the heading in this block
    const discountMatch = block.match(/value-limit">\s*<span>\s*([^<]+)\s*<\/span>/i);
    const discountText = discountMatch ? cleanText(discountMatch[1]!) : "";

    // Extract validity text
    const validityMatch = block.match(/Valid\s+(?:till|until|from|through)[^<]{5,60}/i);
    const validityText = validityMatch ? validityMatch[0].trim() : "";

    // Extract detail link (href within the block)
    const linkMatch = block.match(/href="(https?:\/\/www\.americanexpress\.lk\/en\/offers\/[^"#?]+)"/i);
    const detailUrl = linkMatch ? linkMatch[1]! : "";

    // Extract merchant image.
    // AmEx LK sometimes uses CSS background-image instead of <img> tags inside
    // .alloffer-image, so we try multiple patterns in priority order.
    const rawImageUrl: string =
      // 1. <img> with AmEx absolute URL
      block.match(/<img(?![^>]*(?:width|height)="1")[^>]+src="(https?:\/\/www\.americanexpress\.lk\/[^"]+)"/i)?.[1] ??
      // 2. <img> with site-relative /content/ path (AEM CMS)
      block.match(/<img(?![^>]*(?:width|height)="1")[^>]+src="(\/content\/[^"]+)"/i)?.[1] ??
      // 3. CSS background-image with absolute URL (double or single quotes inside url())
      block.match(/background(?:-image)?\s*:\s*url\(["']?(https?:\/\/[^"')]+)["']?\)/i)?.[1] ??
      // 4. CSS background-image with site-relative path
      block.match(/background(?:-image)?\s*:\s*url\(["']?(\/content\/[^"')]+)["']?\)/i)?.[1] ??
      // 5. Any other absolute <img> with image extension
      block.match(/<img(?![^>]*(?:width|height)="1")[^>]+src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp|gif)[^"]*)"/i)?.[1] ??
      "";

    const imageUrl = rawImageUrl
      ? rawImageUrl.startsWith("http")
        ? rawImageUrl
        : `${BASE_URL}${rawImageUrl}`
      : "";

    cards.push({ merchant, discountText, validityText, detailUrl, imageUrl });
  }

  return cards;
}

// ── Data extraction helpers ──────────────────────────────────────────────────

function extractDates(text: string): { validFrom?: Date; validUntil?: Date } {
  let validFrom: Date | undefined;
  let validUntil: Date | undefined;

  const rangeRe =
    /valid\s+from\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\w+)(?:\s+(\d{4}))?\s+to\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\w+)\s+(\d{4})/i;
  const rangeMatch = text.match(rangeRe);
  if (rangeMatch) {
    const [, fromDay, fromMonth, fromYear, toDay, toMonth, toYear] = rangeMatch;
    validFrom = buildDate(fromDay!, fromMonth!, fromYear ?? toYear!);
    validUntil = buildDate(toDay!, toMonth!, toYear!);
    return { validFrom, validUntil };
  }

  const tillRe =
    /valid\s+(?:till|until|through)\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\w+)\s+(\d{4})/i;
  const tillMatch = text.match(tillRe);
  if (tillMatch) {
    const [, day, month, year] = tillMatch;
    validUntil = buildDate(day!, month!, year!);
  }

  return { validFrom, validUntil };
}

function buildDate(day: string, month: string, year: string): Date | undefined {
  const m = MONTH_MAP[month.toLowerCase()];
  if (!m || !year) return undefined;
  const d = new Date(parseInt(year, 10), m - 1, parseInt(day, 10));
  return isNaN(d.getTime()) ? undefined : d;
}

function detectCategory(merchant: string, offerText: string): OfferInput["category"] | undefined {
  const text = `${merchant} ${offerText}`.toLowerCase();
  if (/dining|restaurant|food|pizza|burger|cafe/.test(text)) return "dining";
  if (/hotel|resort|lodging|accommodation|stay/.test(text)) return "lodging";
  if (/travel|flight|airline|holiday/.test(text)) return "travel";
  if (/fuel|petrol/.test(text)) return "fuel";
  if (/grocery|supermarket|keells|cargills/.test(text)) return "groceries";
  if (/cinema|entertainment|movie/.test(text)) return "entertainment";
  if (/wellness|spa|beauty|salon/.test(text)) return "wellness";
  if (/hospital|pharmacy|health|medical|clinic/.test(text)) return "healthcare";
  if (/online|e-commerce|digital/.test(text)) return "online";
  if (/clothing|fashion|apparel|wear/.test(text)) return "clothing";
  if (/home|furniture|appliance|hardware/.test(text)) return "homecare";
  if (/shopping|retail|boutique/.test(text)) return "shopping";
  return undefined;
}

function cleanText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#\d+;/g, "")
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
