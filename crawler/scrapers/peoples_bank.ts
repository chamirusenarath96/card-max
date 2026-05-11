/**
 * People's Bank (peoplesbank.lk) credit card offer scraper
 * Spec: specs/features/011-new-banks.md
 *
 * Strategy: Iterate over credit card category pages at
 * /promotion-category/{slug}/?cardType=credit_card and parse
 * <div class="promotion-card"> tiles. Each tile has:
 *   - <span class="discount-badge"> for discount text
 *   - <img> for merchant logo
 *   - <h3><a href> for merchant name + detail link
 *   - <p> tags for offer description and validity
 * Falls back to heading-based and table-row parsing for robustness.
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
  { slug: "promotion-category/jewellers", defaultCategory: "shopping" },
  { slug: "promotion-category/auto-mobile", defaultCategory: "other" },
  { slug: "promotion-category/mastercard", defaultCategory: "shopping" },
  { slug: "promotion-category/visa", defaultCategory: "shopping" },
  { slug: "installments", defaultCategory: "other" },
];

const MONTH_MAP: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4,
  may: 5, june: 6, july: 7, august: 8,
  september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4,
  jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

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

function parseOfferCards(
  html: string,
  pageUrl: string,
  defaultCategory: OfferInput["category"],
): Partial<OfferInput>[] {
  const stripped = html.replace(/<!--[\s\S]*?-->/g, "");

  // Primary: .promotion-card divs (current site structure)
  const cardOffers = parseViaPromotionCards(stripped, pageUrl, defaultCategory);
  if (cardOffers.length > 0) return cardOffers;

  // Fallback 1: heading-based (older layout)
  const headingOffers = parseViaHeadings(stripped, pageUrl, defaultCategory);
  if (headingOffers.length > 0) return headingOffers;

  // Fallback 2: table rows
  return parseViaTableRows(stripped, pageUrl);
}

/**
 * Parse <div class="promotion-card"> tiles.
 * Structure: discount-badge span | img | h3>a (merchant + link) | p (desc + validity)
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

    // Merchant name + link from <h3><a>
    const h3Match = block.match(/<h3[^>]*>[\s\S]*?<a[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!h3Match) continue;
    const rawHref = h3Match[1]!;
    const merchant = cleanText(h3Match[2]!);
    if (!merchant || merchant.length < 2) continue;

    const sourceUrl = rawHref.startsWith("http")
      ? rawHref
      : rawHref ? `${BASE_URL}${rawHref}` : pageUrl;

    // Discount from <span class="discount-badge">
    const badgeMatch = block.match(/<span[^>]+class="[^"]*discount-badge[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
    const discountText = badgeMatch ? cleanText(badgeMatch[1]!) : "";

    // Image
    const imgMatch = block.match(/<img\b[^>]+src="([^"]+)"[^>]*>/i);
    const merchantLogoUrl = imgMatch ? toAbsoluteUrl(imgMatch[1]!) : undefined;

    // Paragraphs: first is description, remainder may have validity
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
 * Fallback: scan h2–h5 headings and derive one offer per heading.
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

/**
 * Fallback: parse table rows where each row is one offer.
 */
function parseViaTableRows(html: string, pageUrl: string): Partial<OfferInput>[] {
  const offers: Partial<OfferInput>[] = [];

  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRe.exec(html)) !== null) {
    const cells = [...rowMatch[1]!.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map(c => cleanText(c[1]!));

    if (cells.length < 2) continue;
    const merchant = cells[0]!.trim();
    const offerText = cells[1]!.trim();
    if (!merchant || merchant.length < 2) continue;
    if (merchant.toLowerCase() === "merchant" || merchant.toLowerCase() === "outlet") continue;

    const title = offerText ? offerText.substring(0, 200) : merchant.substring(0, 200);
    const discount = parseDiscount(extractDiscountText(offerText));
    const { validFrom, validUntil } = extractDates(cells.slice(2).join(" ") || offerText);

    offers.push({
      bank: "peoples_bank",
      bankDisplayName: "People's Bank",
      title,
      merchant,
      description: offerText.substring(0, 300) || undefined,
      ...discount,
      category: detectCategory(merchant, offerText) ?? undefined,
      validFrom,
      validUntil,
      sourceUrl: pageUrl,
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
  if (/dining|restaurant|food|pizza|burger|cafe|bistro/.test(t)) return "dining";
  if (/hotel|resort|accommodation|stay|lodge|leisure/.test(t)) return "lodging";
  if (/travel|flight|airline|holiday/.test(t)) return "travel";
  if (/fuel|petrol|gas\s+station/.test(t)) return "fuel";
  if (/grocery|supermarket|keells|cargills|food\s+city/.test(t)) return "groceries";
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
