/**
 * Bank of Ceylon (boc.lk) credit card offer scraper
 *
 * Strategy:
 *   1. Scrape each category listing page — offers are rendered server-side,
 *      no JS execution required.
 *   2. Each listing page contains .swiper-slide.product.unique elements with
 *      all data inline: merchant name, logo image (S3 CDN), description,
 *      expiration date and discount text.
 *   3. No need to follow individual product detail pages.
 *
 * BOC categories and their CardMax mappings:
 *   travel-and-leisure  → lodging
 *   dining              → dining
 *   supermarkets        → groceries
 *   health-beauty       → wellness
 *   zero-plans          → installments
 *   online              → online
 *   visa-offers         → shopping
 *   mastercard-offers   → shopping
 */

import { OfferInputSchema, type OfferInput } from "../../specs/data/offer.schema";
import { fetchHtml, sleep } from "../utils/http";
import { parseDiscount } from "../utils/parseDiscount";

const BASE_URL = "https://www.boc.lk";

/** BOC category slug → CardMax category */
const CATEGORY_MAP: Record<string, OfferInput["category"]> = {
  "travel-and-leisure": "lodging",
  dining:               "dining",
  supermarkets:         "groceries",
  "health-beauty":      "wellness",
  "zero-plans":         "installments",
  online:               "online",
  "visa-offers":        "shopping",
  "mastercard-offers":  "shopping",
  "fashion-lifestyle":  "clothing",
};

export async function scrape(): Promise<OfferInput[]> {
  console.log("[boc] Starting scrape…");
  const allOffers: OfferInput[] = [];

  for (const [slug, category] of Object.entries(CATEGORY_MAP)) {
    const url = `${BASE_URL}/personal-banking/card-offers/${slug}`;
    try {
      await sleep(300);
      const html = await fetchHtml(url);
      const categoryOffers = parseOfferCards(html, category, url);
      console.log(`[boc] ${slug}: ${categoryOffers.length} offers`);
      allOffers.push(...categoryOffers);
    } catch (err) {
      console.warn(`[boc] Failed to scrape category ${slug}:`, (err as Error).message);
    }
  }

  console.log(`[boc] Total scraped: ${allOffers.length} valid offers`);
  return allOffers;
}

// ── HTML parser ──────────────────────────────────────────────────────────────

/**
 * Parse all offer cards from a BOC category listing page.
 *
 * Card structure:
 *   <a href="/personal-banking/card-offers/{cat}/{slug}/product" class="swiper-slide product unique">
 *     <figure class="offer-logo-wrap">
 *       <div class="offers-panel"><div class="offer"><p><strong>40% OFF*</strong></p></div></div>
 *       <img class="offer-logo" src="https://s3.ap-southeast-1.amazonaws.com/static.boc.lk/…" alt="BOC - Merchant">
 *     </figure>
 *     <div class="product-detail">
 *       <div class="top">
 *         <h4>Merchant Name</h4>
 *         <p class="location-name">City, Sri Lanka</p>
 *         <div class="description"><p>Description text</p></div>
 *         <table class="highligh-box">
 *           <tr><td>Expiration date : </td><td>30 Jun 2026</td></tr>
 *         </table>
 *       </div>
 *     </div>
 *   </a>
 */
function parseOfferCards(
  html: string,
  category: OfferInput["category"],
  pageUrl: string,
): OfferInput[] {
  const offers: OfferInput[] = [];

  // Match each offer card anchor block
  const cardRe =
    /<a\s+href="([^"]*\/product)"\s+class="[^"]*swiper-slide product unique[^"]*">([\s\S]*?)<\/a>/gi;

  let cardMatch: RegExpExecArray | null;
  while ((cardMatch = cardRe.exec(html)) !== null) {
    const href = cardMatch[1]!;
    const cardHtml = cardMatch[2]!;

    const sourceUrl = href.startsWith("http") ? href : `${BASE_URL}${href}`;

    // Merchant image (S3 CDN)
    const imgMatch = cardHtml.match(
      /<img\s[^>]*class="offer-logo"[^>]*src="([^"]+)"/i,
    );
    const merchantLogoUrl = imgMatch?.[1] ?? undefined;

    // Merchant name from <h4>
    const h4Match = cardHtml.match(/<h4[^>]*>([\s\S]*?)<\/h4>/i);
    const merchant = h4Match ? cleanText(h4Match[1]!) : "";
    if (!merchant) continue;

    // Description from .description div
    const descMatch = cardHtml.match(
      /<div[^>]*class="[^"]*description[^"]*">([\s\S]*?)<\/div>/i,
    );
    const description = descMatch
      ? cleanText(descMatch[1]!).substring(0, 300) || undefined
      : undefined;

    // Discount text from .offers-panel
    const discountMatch = cardHtml.match(
      /<div[^>]*class="[^"]*offers-panel[^"]*">([\s\S]*?)<\/div>/i,
    );
    const discountRaw = discountMatch
      ? cleanText(discountMatch[1]!) || undefined
      : undefined;

    // Expiration date from <table class="highligh-box">
    const expMatch = cardHtml.match(
      /Expiration date\s*:?\s*<\/td>\s*<td[^>]*>([^<]+)<\/td>/i,
    );
    const validUntil = expMatch
      ? parseBocDate(expMatch[1]!.trim())
      : undefined;

    // Title: compose from merchant + discount
    const title = buildTitle(merchant, discountRaw, description);

    const parsed = parseDiscount(discountRaw);

    const raw: Partial<OfferInput> = {
      bank: "boc",
      bankDisplayName: "Bank of Ceylon",
      title,
      merchant,
      description,
      ...parsed,
      category,
      merchantLogoUrl,
      validUntil,
      sourceUrl,
      scrapedAt: new Date(),
    };

    const result = OfferInputSchema.safeParse(raw);
    if (result.success) {
      offers.push(result.data);
    } else {
      console.warn("[boc] Offer failed validation:", merchant, result.error.flatten());
    }
  }

  return offers;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a human-readable title for an offer.
 * Priority: discount + merchant name → description first sentence → merchant name.
 */
function buildTitle(
  merchant: string,
  discountRaw: string | undefined,
  description: string | undefined,
): string {
  if (discountRaw) {
    const discount = discountRaw.replace(/\*+$/, "").trim();
    return `${discount} at ${merchant}`.substring(0, 200);
  }
  if (description) {
    const firstSentence = description.split(/[.!]/)[0]?.trim();
    if (firstSentence && firstSentence.length > 5) {
      return firstSentence.substring(0, 200);
    }
  }
  return merchant.substring(0, 200);
}

/**
 * Parse BOC date format: "30 Jun 2026" → Date
 */
function parseBocDate(raw: string): Date | undefined {
  if (!raw) return undefined;
  // "30 Jun 2026" or "30/06/2026"
  const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, d, m, y] = slashMatch;
    const date = new Date(`${y!}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`);
    return isNaN(date.getTime()) ? undefined : date;
  }

  const d = new Date(raw);
  return isNaN(d.getTime()) ? undefined : d;
}

function cleanText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#\d+;/g, "")
    .replace(/&[a-z]+;/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
