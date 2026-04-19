/**
 * Nations Trust Bank (nationstrust.com) offer scraper
 * Spec: specs/features/008-playwright-ntb-fallback.md
 *
 * NTB uses Incapsula/Imperva bot protection that blocks plain HTTP requests.
 * Strategy:
 *   1. Try HTTP (session-based) first — faster, no Chromium overhead
 *   2. If Incapsula blocks all listing pages (0 campaign URLs found),
 *      fall back to Playwright headless Chromium which renders JS challenges
 *   3. On any Playwright error, log and return [] — never crash the crawl
 */
import { OfferInputSchema, type OfferInput } from "../../specs/data/offer.schema";
import { fetchHtmlSessioned, pLimit, sleep } from "../utils/http";
import { parseDiscount } from "../utils/parseDiscount";

const HOME_URL = "https://www.nationstrust.com";
const BASE_URL = "https://www.nationstrust.com";

/** Main promotions URL — used as Playwright fallback target */
const PROMOTIONS_URL = "https://www.nationstrust.com/promotions/what-s-new";

/** Known promotion listing pages — used when dynamic discovery is blocked */
const KNOWN_LISTING_URLS = [
  PROMOTIONS_URL,
  "https://www.nationstrust.com/promotions",
];

const MONTH_MAP: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4,
  may: 5, june: 6, july: 7, august: 8,
  september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4,
  jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

export async function scrape(): Promise<OfferInput[]> {
  console.log("[ntb] Starting scrape…");
  const allOffers: OfferInput[] = [];

  const cookieJar = new Map<string, string>();

  try {
    // Step 1: Warm up session by fetching the home page
    console.log("[ntb] Warming up session…");
    try {
      await fetchHtmlSessioned(HOME_URL, cookieJar, undefined, 1000);
      console.log(`[ntb] Session cookies acquired: ${cookieJar.size}`);
    } catch (err) {
      console.warn("[ntb] Home page warm-up failed:", (err as Error).message);
    }

    // Step 2: Collect campaign URLs from listing pages
    const campaignUrls = await collectCampaignUrls(cookieJar);
    console.log(`[ntb] Found ${campaignUrls.length} campaign pages via HTTP`);

    if (campaignUrls.length === 0) {
      console.warn("[ntb] No campaign URLs found — falling back to Playwright");
      return scrapeWithPlaywright();
    }

    // Step 3: Scrape each campaign page (max 3 concurrent, 1.2s gap)
    const tasks = campaignUrls.map((url) => async () => {
      try {
        await sleep(1200);
        const html = await fetchHtmlSessioned(url, cookieJar, KNOWN_LISTING_URLS[0], 0);

        if (isBlockPage(html)) {
          console.warn(`[ntb] Request blocked by Incapsula for ${url}`);
          return [];
        }

        return parseCampaignPage(html, url);
      } catch (err) {
        console.warn(`[ntb] Failed to fetch ${url}:`, (err as Error).message);
        return [];
      }
    });

    const results = await pLimit(tasks, 3);

    for (const pageOffers of results) {
      for (const raw of pageOffers) {
        const result = OfferInputSchema.safeParse(raw);
        if (result.success) {
          allOffers.push(result.data);
        } else {
          console.warn("[ntb] Offer failed validation:", result.error.flatten());
        }
      }
    }
  } catch (err) {
    console.error("[ntb] HTTP flow failed:", err);
    console.log("[ntb] Falling back to Playwright…");
    return scrapeWithPlaywright();
  }

  console.log(`[ntb] Scraped ${allOffers.length} valid offers`);
  return allOffers;
}

/**
 * Playwright fallback: launch headless Chromium to render the promotions page,
 * bypassing Incapsula JS challenge. Returns [] on any error.
 */
async function scrapeWithPlaywright(): Promise<OfferInput[]> {
  try {
    console.log("[ntb] Playwright: launching Chromium…");
    const html = await fetchWithPlaywright(PROMOTIONS_URL);

    if (isBlockPage(html)) {
      console.warn("[ntb] Playwright: page still blocked by Incapsula — returning []");
      return [];
    }

    const rawOffers = parseCampaignPage(html, PROMOTIONS_URL);
    const validOffers: OfferInput[] = [];
    for (const raw of rawOffers) {
      const result = OfferInputSchema.safeParse(raw);
      if (result.success) {
        validOffers.push(result.data);
      } else {
        console.warn("[ntb] Playwright: offer failed validation:", result.error.flatten());
      }
    }

    console.log(`[ntb] Playwright: scraped ${validOffers.length} valid offers`);
    return validOffers;
  } catch (err) {
    console.error("[ntb] Playwright scrape failed:", err);
    return [];
  }
}

/**
 * Launch headless Chromium, navigate to URL, wait for a table element,
 * and return the fully-rendered page HTML.
 * Uses --no-sandbox and --disable-dev-shm-usage for GitHub Actions compatibility.
 */
async function fetchWithPlaywright(url: string): Promise<string> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle" });
    try {
      await page.waitForSelector("table", { timeout: 30000 });
    } catch {
      // Table not found — proceed with whatever content is on the page
    }
    return await page.content();
  } finally {
    await browser.close();
  }
}

/** Returns true if the HTML looks like an Incapsula block / error page */
function isBlockPage(html: string): boolean {
  return (
    html.includes("Incapsula incident ID") ||
    html.includes("_Incapsula_Resource") ||
    html.includes("Request unsuccessful")
  );
}

/** Collect campaign detail-page URLs from the listing pages */
async function collectCampaignUrls(cookieJar: Map<string, string>): Promise<string[]> {
  const seen = new Set<string>();
  const urls: string[] = [];

  for (const listingUrl of KNOWN_LISTING_URLS) {
    try {
      await sleep(1000);
      const html = await fetchHtmlSessioned(listingUrl, cookieJar, HOME_URL, 0);

      if (isBlockPage(html)) {
        console.warn(`[ntb] Listing page blocked: ${listingUrl}`);
        continue;
      }

      const found = extractCampaignLinks(html);
      for (const u of found) {
        if (!seen.has(u)) {
          seen.add(u);
          urls.push(u);
        }
      }
    } catch (err) {
      console.warn(`[ntb] Could not fetch listing ${listingUrl}:`, (err as Error).message);
    }
  }

  return urls;
}

/** Extract /promotions/.../... links from a listing page */
function extractCampaignLinks(html: string): string[] {
  const links: string[] = [];

  const re = /href=["']((?:https?:\/\/(?:www\.)?nationstrust\.com)?\/promotions\/[^"'#?]{5,}\/[^"'#?]{5,})["']/gi;
  let m: RegExpExecArray | null;

  while ((m = re.exec(html)) !== null) {
    const raw = m[1]!;
    const full = raw.startsWith("http") ? raw : `${BASE_URL}${raw}`;
    links.push(full);
  }

  return [...new Set(links)];
}

/**
 * Parse a campaign detail page.
 * Tries the HTML table approach first, falls back to single-offer parsing.
 */
function parseCampaignPage(html: string, sourceUrl: string): Partial<OfferInput>[] {
  const tableOffers = parseOfferTable(html, sourceUrl);
  if (tableOffers.length > 0) return tableOffers;
  const single = parseSingleOffer(html, sourceUrl);
  return single ? [single] : [];
}

/** Parse HTML table: Merchant | Offer Details | Eligibility */
function parseOfferTable(html: string, sourceUrl: string): Partial<OfferInput>[] {
  const offers: Partial<OfferInput>[] = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;
  let rowIndex = 0;

  while ((rowMatch = rowRe.exec(html)) !== null) {
    rowIndex++;
    if (rowIndex === 1) continue; // skip header row

    const cells = extractTableCells(rowMatch[1]!);
    if (cells.length < 2) continue;

    const merchant = cells[0] ? cleanText(cells[0]) : "";
    const offerText = cells[1] ? cleanText(cells[1]) : "";
    const eligibility = cells[2] ? cleanText(cells[2]) : "";

    if (!merchant || merchant.length < 2) continue;

    const discount = parseDiscount(extractDiscount(offerText || eligibility));
    const { validFrom, validUntil } = extractDates(eligibility || offerText);
    const category = detectCategory(merchant, offerText);
    const title = offerText ? offerText.substring(0, 80) : merchant;

    offers.push({
      bank: "nations_trust_bank",
      bankDisplayName: "Nations Trust Bank",
      title,
      merchant,
      description: offerText.substring(0, 300) || undefined,
      ...discount,
      category,
      validFrom,
      validUntil,
      sourceUrl,
      scrapedAt: new Date(),
    });
  }

  return offers;
}

/** Fallback: treat whole page as one offer */
function parseSingleOffer(html: string, sourceUrl: string): Partial<OfferInput> | null {
  const h2Match = html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
  if (!h2Match) return null;

  const title = cleanText(h2Match[1]!);
  if (!title) return null;

  const merchant = extractMerchant(title);
  const bodyText = cleanText(html);
  const discount = parseDiscount(extractDiscount(bodyText));
  const { validFrom, validUntil } = extractDates(bodyText);
  const category = detectCategory(title, bodyText);

  const pMatch = html.match(/<p[^>]*>([\s\S]{10,300}?)<\/p>/i);
  const description = pMatch ? cleanText(pMatch[1]!).substring(0, 300) : undefined;

  const merchantLogoUrl = extractOgImage(html);

  return {
    bank: "nations_trust_bank",
    bankDisplayName: "Nations Trust Bank",
    title,
    merchant,
    description,
    ...discount,
    category,
    merchantLogoUrl,
    validFrom,
    validUntil,
    sourceUrl,
    scrapedAt: new Date(),
  };
}

/**
 * Extract og:image — handles both attribute orderings in the <meta> tag.
 */
function extractOgImage(html: string): string | undefined {
  const m1 = html.match(/<meta\b[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  if (m1?.[1]) return m1[1];
  const m2 = html.match(/<meta\b[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  if (m2?.[1]) return m2[1];
  return undefined;
}

function extractTableCells(rowHtml: string): string[] {
  const cells: string[] = [];
  const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
  let m: RegExpExecArray | null;
  while ((m = cellRe.exec(rowHtml)) !== null) {
    cells.push(m[1]!);
  }
  return cells;
}

function extractMerchant(title: string): string {
  const atMatch = title.match(/\bat\s+(.+?)(?:\s+with\b|\s+for\b|\s+-|,|$)/i);
  if (atMatch) return cleanText(atMatch[1]!).substring(0, 100);
  const withMatch = title.match(/\bwith\s+(.+?)(?:\s+card|\s+bank|,|$)/i);
  if (withMatch) return cleanText(withMatch[1]!).substring(0, 100);
  return title.substring(0, 80);
}

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

function cleanText(text: string): string {
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#\d+;/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
