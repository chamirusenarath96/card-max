/**
 * Nations Trust Bank (nationstrust.com) offer scraper
 * Spec: specs/features/008-playwright-ntb-fallback.md
 *
 * NTB uses server-side rendered HTML — plain HTTP works without a browser.
 * Strategy:
 *   1. Fetch /promotions/what-s-new (listing page)
 *   2. Extract all campaign detail-page links from HTML
 *   3. Fetch each campaign page and parse offer table rows
 *   4. On any error: log warning and return [] — never crash the crawl
 */
import { OfferInputSchema, type OfferInput } from "../../specs/data/offer.schema";
import { parseDiscount } from "../utils/parseDiscount";
import { fetchHtmlSessioned, sleep } from "../utils/http";

const BASE_URL = "https://www.nationstrust.com";
const LISTING_URL = "https://www.nationstrust.com/promotions/what-s-new";

const MONTH_MAP: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4,
  may: 5, june: 6, july: 7, august: 8,
  september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4,
  jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

export async function scrape(): Promise<OfferInput[]> {
  console.log("[ntb] Starting scrape via HTTP…");

  const allOffers: OfferInput[] = [];
  const cookieJar = new Map<string, string>();

  try {
    // Step 1: Fetch listing page
    const listingHtml = await fetchHtmlSessioned(LISTING_URL, cookieJar, BASE_URL, 0);

    if (isBlockPage(listingHtml)) {
      console.warn("[ntb] Listing page blocked by bot protection — returning []");
      return [];
    }

    // Step 2: Extract campaign links
    const campaignLinks = extractCampaignLinks(listingHtml);
    console.log(`[ntb] Found ${campaignLinks.length} campaign links`);

    if (campaignLinks.length === 0) {
      console.warn("[ntb] No campaign links found — page may have changed structure");
      return [];
    }

    // Step 3: Fetch each campaign page and parse tables
    for (const url of campaignLinks) {
      await sleep(400);
      try {
        const html = await fetchHtmlSessioned(url, cookieJar, LISTING_URL, 0);

        if (isBlockPage(html)) {
          console.warn(`[ntb] Campaign page blocked: ${url}`);
          continue;
        }

        const rows = parseCampaignTable(html);
        console.log(`[ntb] ${url}: ${rows.length} offer rows`);

        for (const row of rows) {
          if (!row.merchant || row.merchant.length < 2) continue;

          const discount = parseDiscount(extractDiscount(row.offerText || row.eligibility));
          const { validFrom, validUntil } = extractDates(row.eligibility || row.offerText);
          const category = detectCategory(row.merchant, row.offerText);
          const title = row.offerText ? row.offerText.substring(0, 80) : row.merchant;

          const raw: Partial<OfferInput> = {
            bank: "nations_trust_bank",
            bankDisplayName: "Nations Trust Bank",
            title,
            merchant: row.merchant,
            description: row.offerText.substring(0, 300) || undefined,
            ...discount,
            category,
            validFrom,
            validUntil,
            sourceUrl: url,
            scrapedAt: new Date(),
          };

          const result = OfferInputSchema.safeParse(raw);
          if (result.success) {
            allOffers.push(result.data);
          } else {
            console.warn("[ntb] Offer failed validation:", result.error.flatten());
          }
        }
      } catch (err) {
        console.warn(`[ntb] Failed to fetch ${url}:`, (err as Error).message);
      }
    }
  } catch (err) {
    console.error("[ntb] Scrape failed:", err);
    return [];
  }

  console.log(`[ntb] Scraped ${allOffers.length} valid offers`);
  return allOffers;
}

// ── HTML parsing helpers ─────────────────────────────────────────────────────

/** Returns true if the HTML looks like an Incapsula block page */
function isBlockPage(html: string): boolean {
  return (
    html.includes("Incapsula incident ID") ||
    html.includes("_Incapsula_Resource") ||
    html.includes("Request unsuccessful")
  );
}

/** Extract campaign detail-page links from listing page HTML */
function extractCampaignLinks(html: string): string[] {
  const seen = new Set<string>();
  const links: string[] = [];

  const re = /href=["']((?:https?:\/\/(?:www\.)?nationstrust\.com)?\/promotions\/[^"'#?]{5,}\/[^"'#?]{5,})["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1]!;
    const full = raw.startsWith("http") ? raw : `${BASE_URL}${raw}`;
    if (!seen.has(full)) {
      seen.add(full);
      links.push(full);
    }
  }

  return links;
}

type OfferRow = { merchant: string; offerText: string; eligibility: string };

/**
 * Parse offer table from a campaign page.
 * Strips HTML comments first so commented-out (expired) rows are excluded.
 */
function parseCampaignTable(html: string): OfferRow[] {
  const stripped = html.replace(/<!--[\s\S]*?-->/g, "");
  const rows: OfferRow[] = [];

  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRe.exec(stripped)) !== null) {
    const cells = [...rowMatch[1]!.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) =>
      cleanText(c[1]!)
    );

    if (cells.length < 2) continue;

    const merchant = cells[0]!.trim();
    const offerText = cells[1]!.trim();
    const eligibility = cells[2] ? cells[2].trim() : "";

    // Skip header row
    if (merchant.toLowerCase() === "merchant" || merchant.toLowerCase() === "place") continue;
    if (merchant.length < 2) continue;

    rows.push({ merchant, offerText, eligibility });
  }

  return rows;
}

// ── Data extraction helpers ──────────────────────────────────────────────────

function extractDiscount(text: string): string | undefined {
  const match = text.match(
    /(up\s+to\s+[\d]+%(?:\s+\w+)?|[\d]+%\s+(?:off|discount|cashback|savings?)|[\d]+\s*month\s+0%\s+installment)/i
  );
  return match ? match[0].trim() : undefined;
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

function detectCategory(merchant: string, offerText: string): OfferInput["category"] {
  const text = `${merchant} ${offerText}`.toLowerCase();
  if (/dining|restaurant|food|pizza|burger|cafe|hotel.*dining/.test(text)) return "dining";
  if (/hotel|resort|accommodation|stay|travel|flight|airline|holiday/.test(text)) return "travel";
  if (/fuel|petrol|gas\s+station/.test(text)) return "fuel";
  if (/grocery|supermarket|keells|cargills/.test(text)) return "groceries";
  if (/cinema|entertainment|movie/.test(text)) return "entertainment";
  if (/hospital|pharmacy|health|medical|wellness/.test(text)) return "health";
  if (/online|e-commerce|digital/.test(text)) return "online";
  if (/shopping|retail|fashion|clothing|boutique/.test(text)) return "shopping";
  return "other";
}

function cleanText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#\d+;/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
