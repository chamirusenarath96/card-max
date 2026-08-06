/**
 * Bank of Ceylon (boc.lk) offer scraper
 * Spec: specs/features/011-new-banks.md
 *
 * Strategy: Iterate over BOC's category listing pages and parse offer tiles.
 * Each page at /personal-banking/card-offers/{slug} renders offers as
 * <a class="swiper-slide product unique"> elements with:
 *   - <h4> for merchant name
 *   - <div class="offer"> for discount text
 *   - <div class="description"> for description
 *   - <img class="offer-logo"> for merchant logo
 *   - A table with "Expiration date" row for validity
 * On any error per category: log and continue — never crash the crawl.
 */
import { OfferInputSchema, type OfferInput } from "../../specs/data/offer.schema";
import { fetchHtml, sleep } from "../utils/http";
import { fetchHtmlWithProxyFallback } from "../utils/proxyFetch";
import { parseDiscount } from "../utils/parseDiscount";

const BASE_URL = "https://www.boc.lk";

const CATEGORIES: Array<{ slug: string; defaultCategory: OfferInput["category"] }> = [
  { slug: "travel-and-leisure", defaultCategory: "travel" },
  { slug: "dining", defaultCategory: "dining" },
  { slug: "supermarkets", defaultCategory: "groceries" },
  { slug: "health-beauty", defaultCategory: "wellness" },
  { slug: "zero-plans", defaultCategory: "other" },
  { slug: "online", defaultCategory: "online" },
  { slug: "visa-offers", defaultCategory: "shopping" },
  { slug: "mastercard-offers", defaultCategory: "shopping" },
  { slug: "fashion-lifestyle", defaultCategory: "shopping" },
];

const MONTH_MAP: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4,
  may: 5, june: 6, july: 7, august: 8,
  september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4,
  jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

export async function scrape(): Promise<OfferInput[]> {
  console.log("[boc] Starting scrape…");
  const allOffers: OfferInput[] = [];

  for (const { slug, defaultCategory } of CATEGORIES) {
    const url = `${BASE_URL}/personal-banking/card-offers/${slug}`;
    try {
      const html = await fetchHtmlWithProxyFallback(url, "bank_of_ceylon", () => fetchHtml(url));
      const cards = parseOfferCards(html, url);
      console.log(`[boc] ${slug}: found ${cards.length} offer cards`);

      for (const card of cards) {
        const discount = parseDiscount(card.discountText);
        const category = detectCategory(card.title, card.discountText) ?? defaultCategory;

        const raw: Partial<OfferInput> = {
          bank: "bank_of_ceylon",
          bankDisplayName: "Bank of Ceylon",
          title: card.title.substring(0, 300),
          merchant: card.title.substring(0, 100),
          description: card.description?.substring(0, 300) || undefined,
          merchantLogoUrl: card.imageUrl,
          ...discount,
          category,
          validUntil: card.validUntil,
          sourceUrl: card.sourceUrl || url,
          scrapedAt: new Date(),
        };

        const result = OfferInputSchema.safeParse(raw);
        if (result.success) {
          allOffers.push(result.data);
        } else {
          console.warn("[boc] Offer failed validation:", result.error.flatten());
        }
      }
    } catch (err) {
      console.error(`[boc] Failed to scrape category "${slug}":`, err);
    }

    await sleep(1000);
  }

  console.log(`[boc] Done — ${allOffers.length} offers`);
  return allOffers;
}

// ── HTML parsing helpers ─────────────────────────────────────────────────────

type OfferCard = {
  title: string;
  discountText: string;
  description?: string;
  imageUrl?: string;
  sourceUrl?: string;
  validUntil?: Date;
};

/**
 * Parse offer cards from a BOC category page.
 * BOC renders offers as <a class="swiper-slide product unique"> elements.
 */
function parseOfferCards(html: string, pageUrl: string): OfferCard[] {
  const cards: OfferCard[] = [];

  // BOC-specific swiper-slide product blocks
  // <a href="..." class="swiper-slide product unique">...</a>
  const blockRe = /<a\b([^>]*class="[^"]*\bproduct\b[^"]*"[^>]*)>([\s\S]*?)<\/a>/gi;

  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(html)) !== null) {
    const attrs = m[1]!;
    const block = m[2]!;

    // Merchant name from <h4>
    const h4Match = block.match(/<h4[^>]*>([\s\S]*?)<\/h4>/i);
    if (!h4Match) continue;
    const title = cleanText(h4Match[1]!);
    if (!title || title.length < 2) continue;

    // Source URL from href attribute
    const hrefMatch = attrs.match(/\bhref="([^"]*)"/i);
    const rawHref = hrefMatch ? hrefMatch[1]! : "";
    const sourceUrl = rawHref.startsWith("http")
      ? rawHref
      : rawHref
        ? `${BASE_URL}${rawHref}`
        : pageUrl;

    // Discount text from <div class="offer"> content
    const offerDivMatch = block.match(
      /<div[^>]+class="[^"]*\boffer\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    );
    const discountText = offerDivMatch ? cleanText(offerDivMatch[1]!) : "";

    // Description from <div class="description">
    const descMatch = block.match(
      /<div[^>]+class="[^"]*\bdescription\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    );
    const description = descMatch ? cleanText(descMatch[1]!) : undefined;

    // Image URL from <img> inside the block
    const imgMatch = block.match(/<img\b[^>]+src="([^"]+)"[^>]*>/i);
    const imageUrl = imgMatch ? imgMatch[1] : undefined;

    // Expiration date from table: <td>Expiration date : </td><td>31 Dec 2026</td>
    const validUntil = parseExpirationDate(block);

    cards.push({ title, discountText, description, imageUrl, sourceUrl, validUntil });
  }

  return cards;
}

function parseExpirationDate(block: string): Date | undefined {
  // BOC table format: <td>Expiration date : </td><td>31 Dec 2026</td>
  const expRe = /expiration\s+date\s*:?\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i;
  const expMatch = block.match(expRe);
  if (expMatch) {
    return parseDateString(cleanText(expMatch[1]!));
  }

  // Also handle "valid till/until" in plain text
  const tillMatch = cleanText(block).match(
    /valid\s+(?:till|until|through)\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\w+)\s+(\d{4})/i,
  );
  if (tillMatch) {
    const [, day, month, year] = tillMatch;
    return buildDate(day!, month!, year!);
  }

  return undefined;
}

function parseDateString(str: string): Date | undefined {
  const m = str.match(/(\d{1,2})(?:st|nd|rd|th)?\s+(\w+)\s+(\d{4})/i);
  if (!m) return undefined;
  return buildDate(m[1]!, m[2]!, m[3]!);
}

function buildDate(day: string, month: string, year: string): Date | undefined {
  const m = MONTH_MAP[month.toLowerCase()];
  if (!m || !year) return undefined;
  const d = new Date(parseInt(year, 10), m - 1, parseInt(day, 10));
  return isNaN(d.getTime()) ? undefined : d;
}

function detectCategory(title: string, offerText: string): OfferInput["category"] | null {
  const text = `${title} ${offerText}`.toLowerCase();
  if (/dining|restaurant|food|pizza|burger|cafe|bistro/.test(text)) return "dining";
  if (/hotel|resort|lodging|accommodation|stay/.test(text)) return "travel";
  if (/travel|flight|airline|holiday/.test(text)) return "travel";
  if (/fuel|petrol|gas\s+station/.test(text)) return "fuel";
  if (/grocery|supermarket|keells|cargills|sathosa/.test(text)) return "groceries";
  if (/cinema|entertainment|movie|theme\s+park/.test(text)) return "entertainment";
  if (/wellness|spa|beauty|salon/.test(text)) return "wellness";
  if (/hospital|pharmacy|health|medical|clinic/.test(text)) return "healthcare";
  if (/online|e-commerce|digital/.test(text)) return "online";
  if (/clothing|fashion|apparel|wear/.test(text)) return "shopping";
  if (/home|furniture|appliance|hardware/.test(text)) return "homecare";
  if (/shopping|retail|boutique/.test(text)) return "shopping";
  return null;
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
