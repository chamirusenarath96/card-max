/**
 * People's Bank (peoplesbank.lk) credit card offer scraper
 * Spec: specs/features/011-new-banks.md
 *
 * Strategy: Fetch the promotions listing page with browser-like headers.
 * The site uses server-side rendering so no JS execution is required.
 * Parses offers by scanning for headings and gathering surrounding context
 * (image, description paragraphs, validity dates), which is robust to any
 * CMS layout. Falls back to table-row parsing for older site layouts.
 * Returns [] on any error without throwing.
 */
import { OfferInputSchema, type OfferInput } from "../../specs/data/offer.schema";
import { fetchHtml } from "../utils/http";
import { parseDiscount } from "../utils/parseDiscount";

const SOURCE_URL =
  "https://www.peoplesbank.lk/personal-banking/cards/credit-cards/promotions/";

const MONTH_MAP: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4,
  may: 5, june: 6, july: 7, august: 8,
  september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4,
  jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

export async function scrape(): Promise<OfferInput[]> {
  console.log("[peoples_bank] Starting scrape…");
  const offers: OfferInput[] = [];

  try {
    const html = await fetchHtml(SOURCE_URL);
    const parsed = parseOfferItems(html);
    console.log(`[peoples_bank] Found ${parsed.length} offer items`);

    for (const raw of parsed) {
      const result = OfferInputSchema.safeParse(raw);
      if (result.success) {
        offers.push(result.data);
      } else {
        console.warn("[peoples_bank] Offer failed validation:", result.error.flatten());
      }
    }
  } catch (err) {
    console.error("[peoples_bank] Scrape failed:", (err as Error).message);
    // Never rethrow — return [] so other scrapers continue
  }

  console.log(`[peoples_bank] Scraped ${offers.length} valid offers`);
  return offers;
}

/**
 * Parse offer items from the People's Bank promotions listing page.
 *
 * Strategy: scan for h2–h5 headings; for each heading, extract a context
 * window (300 chars before + 600 chars after) to gather image, description,
 * and validity information. Falls back to table-row parsing if no headings found.
 */
function parseOfferItems(html: string): Partial<OfferInput>[] {
  const stripped = html.replace(/<!--[\s\S]*?-->/g, "");

  const headingOffers = parseViaHeadings(stripped);
  if (headingOffers.length > 0) return headingOffers;

  return parseViaTableRows(stripped);
}

/**
 * Scan for headings (h2–h5) and derive one offer per heading.
 * Extracts a context window around each heading to find image, description,
 * validity dates, and discount text — independent of the surrounding div structure.
 */
function parseViaHeadings(html: string): Partial<OfferInput>[] {
  const offers: Partial<OfferInput>[] = [];
  const seen = new Set<string>();

  const headingRe = /<h[2-5][^>]*>([\s\S]*?)<\/h[2-5]>/gi;
  let m: RegExpExecArray | null;

  while ((m = headingRe.exec(html)) !== null) {
    const rawTitle = cleanText(m[1]!);
    if (!rawTitle || rawTitle.length < 5) continue;
    if (seen.has(rawTitle)) continue;
    seen.add(rawTitle);

    // Context window: 300 chars before the heading + 600 chars after it
    const headStart = m.index;
    const headEnd = headStart + m[0].length;
    const before = html.slice(Math.max(0, headStart - 300), headStart);
    const after = html.slice(headEnd, headEnd + 600);

    // Image: look in the before-window first, then after-window
    const imgMatch =
      before.match(/<img\b[^>]+src="(https?:\/\/[^"]+)"[^>]*>/i) ??
      after.match(/<img\b[^>]+src="(https?:\/\/[^"]+)"[^>]*>/i) ??
      before.match(/<img\b[^>]+src="([^"]+)"[^>]*>/i) ??
      after.match(/<img\b[^>]+src="([^"]+)"[^>]*>/i);
    const merchantLogoUrl = imgMatch ? toValidUrl(imgMatch[1]!) : undefined;

    // Paragraphs after the heading
    const paraMatches = [...after.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)];
    const paragraphs = paraMatches.map((p) => cleanText(p[1]!)).filter((t) => t.length > 5);

    const description = paragraphs
      .find((t) => t.toLowerCase() !== rawTitle.toLowerCase())
      ?.substring(0, 300);

    // Validity dates from all paragraph text after the heading
    const afterText = cleanText(after);
    const { validFrom, validUntil } = extractDates(afterText);

    // Discount from title + description
    const discountText = extractDiscountText(rawTitle + " " + (description ?? ""));
    const discount = parseDiscount(discountText);

    const merchant = extractMerchant(rawTitle);

    // Link: prefer absolute URL in before/after window
    const linkMatch =
      before.match(/href="(https?:\/\/[^"]+)"/i) ??
      after.match(/href="(https?:\/\/[^"]+)"/i);
    const offerSourceUrl = linkMatch ? linkMatch[1]! : SOURCE_URL;

    offers.push({
      bank: "peoples_bank",
      bankDisplayName: "People's Bank",
      title: rawTitle.substring(0, 200),
      merchant,
      description,
      ...discount,
      category: detectCategory(merchant, rawTitle + " " + (description ?? "")),
      merchantLogoUrl,
      validFrom,
      validUntil,
      sourceUrl: offerSourceUrl,
      scrapedAt: new Date(),
    });
  }

  return offers;
}

/**
 * Fallback: parse table rows where each row is one offer
 * (Merchant | Offer text | Validity).
 */
function parseViaTableRows(html: string): Partial<OfferInput>[] {
  const offers: Partial<OfferInput>[] = [];

  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRe.exec(html)) !== null) {
    const cells = [...rowMatch[1]!.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) =>
      cleanText(c[1]!),
    );

    if (cells.length < 2) continue;

    const merchant = cells[0]!.trim();
    const offerText = cells[1]!.trim();

    if (!merchant || merchant.length < 2) continue;
    if (merchant.toLowerCase() === "merchant" || merchant.toLowerCase() === "outlet") continue;

    const title = offerText ? offerText.substring(0, 200) : merchant.substring(0, 200);
    const discount = parseDiscount(extractDiscountText(offerText));
    const { validFrom, validUntil } = extractDates(
      cells.slice(2).join(" ") || offerText,
    );

    offers.push({
      bank: "peoples_bank",
      bankDisplayName: "People's Bank",
      title,
      merchant,
      description: offerText.substring(0, 300) || undefined,
      ...discount,
      category: detectCategory(merchant, offerText),
      validFrom,
      validUntil,
      sourceUrl: SOURCE_URL,
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
    /valid\s+(?:till|until|through|up\s+to)\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\w+)\s+(\d{4})/i;
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

function detectCategory(merchant: string, text: string): OfferInput["category"] {
  const t = `${merchant} ${text}`.toLowerCase();
  if (/dining|restaurant|food|pizza|burger|cafe|bistro/.test(t)) return "dining";
  if (/hotel|resort|accommodation|stay|lodge/.test(t)) return "lodging";
  if (/travel|flight|airline|holiday/.test(t)) return "travel";
  if (/fuel|petrol|gas\s+station/.test(t)) return "fuel";
  if (/grocery|supermarket|keells|cargills|food\s+city/.test(t)) return "groceries";
  if (/cinema|entertainment|movie|theme\s+park/.test(t)) return "entertainment";
  if (/wellness|spa|beauty|salon/.test(t)) return "wellness";
  if (/hospital|pharmacy|health|medical|clinic/.test(t)) return "healthcare";
  if (/online|e-commerce|digital/.test(t)) return "online";
  if (/clothing|fashion|apparel|wear/.test(t)) return "clothing";
  if (/home|furniture|appliance|hardware/.test(t)) return "homecare";
  if (/shopping|retail|boutique/.test(t)) return "shopping";
  return "other";
}

function toValidUrl(raw: string): string | undefined {
  if (!raw) return undefined;
  const decoded = raw.replace(/&amp;/g, "&").trim();
  try {
    new URL(decoded);
    return decoded;
  } catch {
    return undefined;
  }
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
