/**
 * People's Bank (peoplesbank.lk) credit card offer scraper
 * Spec: specs/features/011-new-banks.md
 *
 * Strategy: Iterate over credit card category pages at
 * /promotion-category/{slug}/?cardType=credit_card and parse
 * <article class="offer-card"> tiles. Each tile has:
 *   - <div class="discount-badge"> for discount percentage
 *   - <div class="promo-short"> for merchant name
 *   - <span class="merchant-name"> for offer description
 *   - <a href> in .offer-image for the detail page link
 *   - <img> in .offer-image for the merchant logo
 *
 * NOTE: The site embeds staff-directory popups (sgpb-main-popup-data-container)
 * on every page containing Tamil/Sinhala-script manager names in <h2> elements.
 * These are stripped before any parsing to prevent junk data ingestion.
 *
 * Returns [] on any error without throwing.
 */
import { OfferInputSchema, type OfferInput } from "../../specs/data/offer.schema";
import { fetchHtml, sleep } from "../utils/http";
import { parseDiscount } from "../utils/parseDiscount";

const BASE_URL = "https://www.peoplesbank.lk";

const CATEGORIES: Array<{ slug: string; defaultCategory: OfferInput["category"] }> = [
  { slug: "promotion-category/restaurants", defaultCategory: "dining" },
  { slug: "promotion-category/supermarkets", defaultCategory: "groceries" },
  { slug: "promotion-category/leisure", defaultCategory: "entertainment" },
  { slug: "promotion-category/online-stores", defaultCategory: "online" },
  { slug: "promotion-category/home-care-electronics", defaultCategory: "homecare" },
  { slug: "promotion-category/travel", defaultCategory: "travel" },
  { slug: "promotion-category/auto-mobile", defaultCategory: "other" },
  { slug: "installments", defaultCategory: "other" },
];

const MONTH_MAP: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4,
  may: 5, june: 6, july: 7, august: 8,
  september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4,
  jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** Tamil Unicode block: U+0B80–U+0BFF; Sinhala block: U+0D80–U+0DFF */
const NON_LATIN_SCRIPT_RE = /[஀-௿඀-෿ऀ-ॿ]/;

export async function scrape(): Promise<OfferInput[]> {
  console.log("[peoples_bank] Starting scrape…");
  const allOffers: OfferInput[] = [];
  const seenTitles = new Set<string>();

  for (const { slug, defaultCategory } of CATEGORIES) {
    const url = `${BASE_URL}/${slug}/?cardType=credit_card`;
    try {
      const html = await fetchHtml(url);
      const parsed = parseOfferCards(html, url, defaultCategory);
      console.log(`[peoples_bank] ${slug}: found ${parsed.length} offers`);

      for (const raw of parsed) {
        const key = `${raw.merchant}|${raw.title}`;
        if (seenTitles.has(key)) continue;
        seenTitles.add(key);

        const result = OfferInputSchema.safeParse(raw);
        if (result.success) {
          allOffers.push(result.data);
        } else {
          console.warn("[peoples_bank] Offer failed validation:", result.error.flatten());
        }
      }
    } catch (err) {
      console.error(`[peoples_bank] Failed to scrape "${slug}":`, (err as Error).message);
    }

    await sleep(1000);
  }

  console.log(`[peoples_bank] Scraped ${allOffers.length} valid offers`);
  return allOffers;
}

// ── Parsers ──────────────────────────────────────────────────────────────────

/**
 * Pre-process HTML before any parsing:
 * 1. Strip HTML comments
 * 2. Strip staff-directory popup modals (sgpb-main-popup-data-container divs)
 *    which embed Tamil/Sinhala-script manager profiles on every page.
 */
function preprocessHtml(html: string): string {
  // Strip HTML comments
  let cleaned = html.replace(/<!--[\s\S]*?-->/g, "");

  // Strip SG Popup Builder popup containers — these hold staff directory content
  // with Tamil names that would otherwise pollute heading-based parsing
  cleaned = cleaned.replace(
    /<div[^>]+class="[^"]*sgpb-main-popup-data-container[^"]*"[^>]*>[\s\S]*?<\/div>\s*(?=<div|$)/gi,
    ""
  );

  return cleaned;
}

function parseOfferCards(
  html: string,
  pageUrl: string,
  defaultCategory: OfferInput["category"],
): Partial<OfferInput>[] {
  const stripped = preprocessHtml(html);

  // If the page explicitly says there are no promotions, skip all parsing
  if (/No Promotions Available/i.test(stripped)) {
    return [];
  }

  // Primary: <article class="offer-card"> (current site structure as of 2026)
  const articleOffers = parseViaOfferArticles(stripped, pageUrl, defaultCategory);
  if (articleOffers.length > 0) return articleOffers;

  // Legacy fallback: .promotion-card divs (older site layout — kept for resilience)
  const cardOffers = parseViaPromotionCards(stripped, pageUrl, defaultCategory);
  if (cardOffers.length > 0) return cardOffers;

  // Last-resort fallback: heading-based parsing (only if no card structure found)
  return parseViaHeadings(stripped, pageUrl, defaultCategory);
}

/**
 * Parse <article class="offer-card"> tiles — current People's Bank site structure.
 *
 * Structure:
 *   <article class="offer-card">
 *     <div class="discount-badge">30%</div>
 *     <div class="offer-image">
 *       <a href="...detail-page..."><img src="..." alt="..." /></a>
 *     </div>
 *     <div class="card-content">
 *       <div class="promo-short fw-medium">Merchant Name</div>
 *       <div class="meta">
 *         <span class="merchant-name">Description text</span>
 *       </div>
 *     </div>
 *   </article>
 */
function parseViaOfferArticles(
  html: string,
  pageUrl: string,
  defaultCategory: OfferInput["category"],
): Partial<OfferInput>[] {
  const offers: Partial<OfferInput>[] = [];

  // Match each <article class="offer-card">...</article> block
  const articleRe = /<article[^>]+class="[^"]*offer-card[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;
  let m: RegExpExecArray | null;

  while ((m = articleRe.exec(html)) !== null) {
    const block = m[1]!;

    // Discount badge
    const badgeMatch = block.match(/<div[^>]+class="[^"]*discount-badge[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const discountText = badgeMatch ? cleanText(badgeMatch[1]!) : "";

    // Merchant name from .promo-short
    const promoShortMatch = block.match(/<div[^>]+class="[^"]*promo-short[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const merchant = promoShortMatch ? cleanText(promoShortMatch[1]!) : "";
    if (!merchant || merchant.length < 2) continue;

    // Skip entries with non-Latin (Tamil/Sinhala) script in the merchant name
    if (NON_LATIN_SCRIPT_RE.test(merchant)) continue;

    // Description from .merchant-name span
    const descMatch = block.match(/<span[^>]+class="[^"]*merchant-name[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
    const description = descMatch ? cleanText(descMatch[1]!).substring(0, 300) : undefined;

    // Source URL: first <a href> inside .offer-image
    const imgLinkMatch = block.match(
      /<div[^>]+class="[^"]*offer-image[^"]*"[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"/i
    );
    const rawHref = imgLinkMatch?.[1] ?? "";
    const sourceUrl = rawHref.startsWith("http")
      ? rawHref
      : rawHref ? `${BASE_URL}${rawHref}` : pageUrl;

    // Merchant logo <img>
    const imgMatch = block.match(/<img\b[^>]+src="([^"]+)"[^>]*>/i);
    const merchantLogoUrl = imgMatch ? toAbsoluteUrl(imgMatch[1]!) : undefined;

    const allText = (description ?? "") + " " + discountText;
    const { validFrom, validUntil } = extractDates(allText);
    const discount = parseDiscount(discountText || undefined);
    const category = detectCategory(merchant, allText) ?? defaultCategory;

    const titleDiscount = discountText || extractDiscountText(allText);
    const title = (titleDiscount ? `${titleDiscount} at ${merchant}` : merchant).substring(0, 200);

    offers.push({
      bank: "peoples_bank",
      bankDisplayName: "People's Bank",
      title,
      merchant: merchant.substring(0, 100),
      description,
      ...discount,
      category,
      merchantLogoUrl,
      validFrom,
      validUntil,
      sourceUrl,
      scrapedAt: new Date(),
    });
  }

  return offers;
}

/**
 * Legacy: Parse <div class="promotion-card"> tiles (older site layout).
 * Kept as resilience fallback in case the site reverts.
 */
function parseViaPromotionCards(
  html: string,
  pageUrl: string,
  defaultCategory: OfferInput["category"],
): Partial<OfferInput>[] {
  const offers: Partial<OfferInput>[] = [];

  const cardRe = /<div[^>]+class="[^"]*promotion-card[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?=<div|<\/)/gi;
  let m: RegExpExecArray | null;

  while ((m = cardRe.exec(html)) !== null) {
    const block = m[1]!;

    const h3Match = block.match(/<h3[^>]*>[\s\S]*?<a[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!h3Match) continue;
    const rawHref = h3Match[1]!;
    const merchant = cleanText(h3Match[2]!);
    if (!merchant || merchant.length < 2) continue;
    if (NON_LATIN_SCRIPT_RE.test(merchant)) continue;

    const sourceUrl = rawHref.startsWith("http")
      ? rawHref
      : rawHref ? `${BASE_URL}${rawHref}` : pageUrl;

    const badgeMatch = block.match(/<span[^>]+class="[^"]*discount-badge[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
    const discountText = badgeMatch ? cleanText(badgeMatch[1]!) : "";

    const imgMatch = block.match(/<img\b[^>]+src="([^"]+)"[^>]*>/i);
    const merchantLogoUrl = imgMatch ? toAbsoluteUrl(imgMatch[1]!) : undefined;

    const paras = [...block.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
      .map(p => cleanText(p[1]!))
      .filter(t => t.length > 3);

    const description = paras[0]?.substring(0, 300);
    const allText = paras.join(" ");
    const { validFrom, validUntil } = extractDates(allText);

    const discount = parseDiscount(discountText || extractDiscountText(merchant + " " + (description ?? "")));
    const category = detectCategory(merchant, (description ?? "") + " " + discountText) ?? defaultCategory;

    offers.push({
      bank: "peoples_bank",
      bankDisplayName: "People's Bank",
      title: (discountText ? `${discountText} at ${merchant}` : merchant).substring(0, 200),
      merchant: merchant.substring(0, 100),
      description,
      ...discount,
      category,
      merchantLogoUrl,
      validFrom,
      validUntil,
      sourceUrl,
      scrapedAt: new Date(),
    });
  }

  return offers;
}

/**
 * Last-resort fallback: scan h2–h5 headings and derive one offer per heading.
 * Only used when no card/article structure is found on the page.
 */
function parseViaHeadings(
  html: string,
  pageUrl: string,
  defaultCategory: OfferInput["category"],
): Partial<OfferInput>[] {
  const offers: Partial<OfferInput>[] = [];
  const seen = new Set<string>();

  const headingRe = /<h[2-5][^>]*>([\s\S]*?)<\/h[2-5]>/gi;
  let m: RegExpExecArray | null;

  while ((m = headingRe.exec(html)) !== null) {
    const rawTitle = cleanText(m[1]!);
    if (!rawTitle || rawTitle.length < 5 || seen.has(rawTitle)) continue;
    // Skip Tamil/Sinhala-script headings (staff directory entries)
    if (NON_LATIN_SCRIPT_RE.test(rawTitle)) continue;
    seen.add(rawTitle);

    const headEnd = m.index + m[0].length;
    const before = html.slice(Math.max(0, m.index - 300), m.index);
    const after = html.slice(headEnd, headEnd + 600);

    const imgMatch =
      before.match(/<img\b[^>]+src="(https?:\/\/[^"]+)"[^>]*>/i) ??
      after.match(/<img\b[^>]+src="(https?:\/\/[^"]+)"[^>]*>/i);
    const merchantLogoUrl = imgMatch ? imgMatch[1] : undefined;

    const paras = [...after.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
      .map(p => cleanText(p[1]!)).filter(t => t.length > 5);
    const description = paras.find(t => t.toLowerCase() !== rawTitle.toLowerCase())?.substring(0, 300);
    const { validFrom, validUntil } = extractDates(paras.join(" "));

    const discountText = extractDiscountText(rawTitle + " " + (description ?? ""));
    const discount = parseDiscount(discountText);
    const merchant = extractMerchant(rawTitle);
    const category = detectCategory(merchant, rawTitle + " " + (description ?? "")) ?? defaultCategory;

    const linkMatch = before.match(/href="(https?:\/\/[^"]+)"/i) ?? after.match(/href="(https?:\/\/[^"]+)"/i);

    offers.push({
      bank: "peoples_bank",
      bankDisplayName: "People's Bank",
      title: rawTitle.substring(0, 200),
      merchant,
      description,
      ...discount,
      category,
      merchantLogoUrl,
      validFrom,
      validUntil,
      sourceUrl: linkMatch ? linkMatch[1]! : pageUrl,
      scrapedAt: new Date(),
    });
  }

  return offers;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractMerchant(title: string): string {
  const atMatch = title.match(/\bat\s+(.+?)(?:\s+with\b|\s+for\b|\s+on\b|\s+–|\s+-|,|$)/i);
  if (atMatch) return cleanText(atMatch[1]!).substring(0, 100);
  return title.substring(0, 80);
}

function extractDiscountText(text: string): string | undefined {
  const m = text.match(
    /(up\s+to\s+\d+%(?:\s+\w+)?|\d+%\s+(?:off|discount|cashback|savings?)|\d+%|buy\s+\d+\s+get\s+\d+|interest[\s-]*free|easy[\s-]?pay)/i,
  );
  return m ? m[0].trim() : undefined;
}

function extractDates(text: string): { validFrom?: Date; validUntil?: Date } {
  const rangeRe =
    /valid\s+from\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\w+)(?:\s+(\d{4}))?\s+to\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\w+)\s+(\d{4})/i;
  const rangeMatch = text.match(rangeRe);
  if (rangeMatch) {
    const [, fromDay, fromMonth, fromYear, toDay, toMonth, toYear] = rangeMatch;
    return {
      validFrom: buildDate(fromDay!, fromMonth!, fromYear ?? toYear!),
      validUntil: buildDate(toDay!, toMonth!, toYear!),
    };
  }

  const tillRe =
    /valid\s+(?:till|until|through|up\s+to)\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\w+)\s+(\d{4})/i;
  const tillMatch = text.match(tillRe);
  if (tillMatch) {
    return { validUntil: buildDate(tillMatch[1]!, tillMatch[2]!, tillMatch[3]!) };
  }

  return {};
}

function buildDate(day: string, month: string, year: string): Date | undefined {
  const m = MONTH_MAP[month.toLowerCase()];
  if (!m || !year) return undefined;
  const d = new Date(parseInt(year, 10), m - 1, parseInt(day, 10));
  return isNaN(d.getTime()) ? undefined : d;
}

function detectCategory(merchant: string, text: string): OfferInput["category"] | null {
  const t = `${merchant} ${text}`.toLowerCase();
  if (/dining|restaurant|\bfood\b|pizza|burger|cafe|bistro/.test(t)) return "dining";
  if (/hotel|resort|accommodation|stay|lodge|leisure/.test(t)) return "lodging";
  if (/travel|flight|airline|holiday/.test(t)) return "travel";
  if (/fuel|petrol|gas\s+station/.test(t)) return "fuel";
  if (/grocery|supermarket|keells|cargills|food\s+city|glomark|spar/.test(t)) return "groceries";
  if (/cinema|entertainment|movie|theme\s+park/.test(t)) return "entertainment";
  if (/wellness|spa|beauty|salon/.test(t)) return "wellness";
  if (/hospital|pharmacy|health|medical|clinic/.test(t)) return "healthcare";
  if (/online|e-commerce|digital/.test(t)) return "online";
  if (/clothing|fashion|apparel|wear/.test(t)) return "clothing";
  if (/home|furniture|appliance|electronic|hardware/.test(t)) return "homecare";
  if (/shopping|retail|boutique|jewel/.test(t)) return "shopping";
  return null;
}

function toAbsoluteUrl(raw: string): string | undefined {
  if (!raw) return undefined;
  const decoded = raw.replace(/&amp;/g, "&").trim();
  if (decoded.startsWith("http")) return decoded;
  if (decoded.startsWith("/")) return `${BASE_URL}${decoded}`;
  return undefined;
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
