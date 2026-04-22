/**
 * American Express NTB (americanexpress.lk) offer scraper
 * Spec: specs/features/010-amex-offers.md
 *
 * NTB issues all Sri Lankan American Express cards via americanexpress.lk,
 * which uses Incapsula/Imperva bot protection similar to nationstrust.com.
 *
 * Strategy:
 *   1. Warm up Incapsula session by fetching the home page
 *   2. Fetch offers listing page(s) with session cookies
 *   3. Parse offer cards from HTML using multiple fallback selectors
 *   4. If Incapsula blocks (0 offers found after listing pages), fall back
 *      to Playwright headless Chromium
 *   5. Any error → return [] and log a warning (never crash the crawl)
 */
import { OfferInputSchema, type OfferInput } from "../../specs/data/offer.schema";
import { fetchHtmlSessioned, pLimit, sleep } from "../utils/http";
import { parseDiscount } from "../utils/parseDiscount";

const HOME_URL = "https://www.americanexpress.lk";
const BASE_URL = "https://www.americanexpress.lk";

const LISTING_URLS = [
  "https://www.americanexpress.lk/offers",
  "https://www.americanexpress.lk/exclusive-offers",
];

const MONTH_MAP: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4,
  may: 5, june: 6, july: 7, august: 8,
  september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4,
  jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

export async function scrape(): Promise<OfferInput[]> {
  console.log("[amex] Starting scrape…");
  const allOffers: OfferInput[] = [];
  const cookieJar = new Map<string, string>();

  try {
    // Step 1: Warm up session
    console.log("[amex] Warming up session…");
    try {
      await fetchHtmlSessioned(HOME_URL, cookieJar, undefined, 1000);
      console.log(`[amex] Session cookies acquired: ${cookieJar.size}`);
    } catch (err) {
      console.warn("[amex] Home page warm-up failed:", (err as Error).message);
    }

    // Step 2: Collect offer detail URLs from listing pages
    const offerUrls = await collectOfferUrls(cookieJar);
    console.log(`[amex] Found ${offerUrls.length} offer page(s) via HTTP`);

    if (offerUrls.length === 0) {
      // Try parsing offers directly from listing pages before giving up
      const listingOffers = await parseListingPages(cookieJar);
      if (listingOffers.length > 0) {
        console.log(`[amex] Extracted ${listingOffers.length} offers from listing pages directly`);
        return listingOffers;
      }
      console.warn("[amex] No offers found via HTTP — falling back to Playwright");
      return scrapeWithPlaywright();
    }

    // Step 3: Scrape each offer detail page (max 3 concurrent, 1.2s gap)
    const tasks = offerUrls.map((url) => async () => {
      try {
        await sleep(1200);
        const html = await fetchHtmlSessioned(url, cookieJar, LISTING_URLS[0], 0);
        if (isBlockPage(html)) {
          console.warn(`[amex] Request blocked by Incapsula for ${url}`);
          return [];
        }
        return parseOfferDetailPage(html, url);
      } catch (err) {
        console.warn(`[amex] Failed to fetch ${url}:`, (err as Error).message);
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
          console.warn("[amex] Offer failed validation:", result.error.flatten());
        }
      }
    }
  } catch (err) {
    console.error("[amex] HTTP flow failed:", err);
    console.log("[amex] Falling back to Playwright…");
    return scrapeWithPlaywright();
  }

  console.log(`[amex] Scraped ${allOffers.length} valid offers`);
  return allOffers;
}

/** Playwright fallback: headless Chromium to bypass Incapsula JS challenge */
async function scrapeWithPlaywright(): Promise<OfferInput[]> {
  try {
    console.log("[amex] Playwright: launching Chromium…");
    const html = await fetchWithPlaywright(LISTING_URLS[0]);

    if (isBlockPage(html)) {
      console.warn("[amex] Playwright: page still blocked by Incapsula — returning []");
      return [];
    }

    const rawOffers = parseOfferCards(html, LISTING_URLS[0]);
    const validOffers: OfferInput[] = [];
    for (const raw of rawOffers) {
      const result = OfferInputSchema.safeParse(raw);
      if (result.success) {
        validOffers.push(result.data);
      } else {
        console.warn("[amex] Playwright: offer failed validation:", result.error.flatten());
      }
    }

    console.log(`[amex] Playwright: scraped ${validOffers.length} valid offers`);
    return validOffers;
  } catch (err) {
    console.error("[amex] Playwright scrape failed:", err);
    return [];
  }
}

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
      // Wait for offer cards to appear (multiple selector fallbacks)
      await page.waitForSelector(
        ".offer-card, .promo-item, [data-testid=\"offer-card\"], .offer-listing-item",
        { timeout: 30000 }
      );
    } catch {
      // No recognisable offer elements — proceed with whatever is on the page
    }
    return await page.content();
  } finally {
    await browser.close();
  }
}

function isBlockPage(html: string): boolean {
  return (
    html.includes("Incapsula incident ID") ||
    html.includes("_Incapsula_Resource") ||
    html.includes("Request unsuccessful")
  );
}

/** Extract offer detail-page links from listing pages */
async function collectOfferUrls(cookieJar: Map<string, string>): Promise<string[]> {
  const seen = new Set<string>();
  const urls: string[] = [];

  for (const listingUrl of LISTING_URLS) {
    try {
      await sleep(1000);
      const html = await fetchHtmlSessioned(listingUrl, cookieJar, HOME_URL, 0);

      if (isBlockPage(html)) {
        console.warn(`[amex] Listing page blocked: ${listingUrl}`);
        continue;
      }

      const found = extractOfferLinks(html);
      for (const u of found) {
        if (!seen.has(u)) {
          seen.add(u);
          urls.push(u);
        }
      }
    } catch (err) {
      console.warn(`[amex] Could not fetch listing ${listingUrl}:`, (err as Error).message);
    }
  }

  return urls;
}

/** Extract /offers/... or /exclusive-offers/... detail links from a listing page */
function extractOfferLinks(html: string): string[] {
  const links: string[] = [];
  const re = /href=["']((?:https?:\/\/(?:www\.)?americanexpress\.lk)?\/(?:offers|exclusive-offers)\/[^"'#?]{4,})["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1]!;
    const full = raw.startsWith("http") ? raw : `${BASE_URL}${raw}`;
    links.push(full);
  }
  return [...new Set(links)];
}

/** Try to parse offers directly from listing page HTML (card grid layout) */
async function parseListingPages(cookieJar: Map<string, string>): Promise<OfferInput[]> {
  const allOffers: OfferInput[] = [];

  for (const listingUrl of LISTING_URLS) {
    try {
      await sleep(1000);
      const html = await fetchHtmlSessioned(listingUrl, cookieJar, HOME_URL, 0);

      if (isBlockPage(html)) continue;

      const rawOffers = parseOfferCards(html, listingUrl);
      for (const raw of rawOffers) {
        const result = OfferInputSchema.safeParse(raw);
        if (result.success) {
          allOffers.push(result.data);
        } else {
          console.warn("[amex] Listing offer failed validation:", result.error.flatten());
        }
      }
    } catch (err) {
      console.warn(`[amex] Could not parse listing ${listingUrl}:`, (err as Error).message);
    }
  }

  return allOffers;
}

/**
 * Parse offer card elements from a grid/listing page.
 * Tries multiple selector patterns that americanexpress.lk is known to use.
 */
function parseOfferCards(html: string, sourceUrl: string): Partial<OfferInput>[] {
  // Strategy 1: look for blocks wrapped in offer-card class variants
  const cardPatterns = [
    /<(?:div|article|li)[^>]+class=["'][^"']*(?:offer-card|promo-item|offer-listing-item|offer-tile|promotion-card)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|article|li)>/gi,
  ];

  for (const pattern of cardPatterns) {
    const offers = extractCardBlocks(html, pattern, sourceUrl);
    if (offers.length > 0) return offers;
  }

  // Strategy 2: fall back to parsing the whole page as a single offer
  return parseSingleOffer(html, sourceUrl) ? [parseSingleOffer(html, sourceUrl)!] : [];
}

function extractCardBlocks(
  html: string,
  pattern: RegExp,
  sourceUrl: string
): Partial<OfferInput>[] {
  const offers: Partial<OfferInput>[] = [];
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(html)) !== null) {
    const block = m[0]!;
    const offer = parseCardBlock(block, sourceUrl);
    if (offer) offers.push(offer);
  }
  return offers;
}

function parseCardBlock(block: string, sourceUrl: string): Partial<OfferInput> | null {
  const title = extractTitle(block);
  if (!title) return null;

  const merchant = extractMerchant(block, title);
  const discountText = extractDiscountText(block);
  const discount = parseDiscount(discountText);
  const { validFrom, validUntil } = extractDates(cleanText(block));
  const category = detectCategory(merchant, title + " " + (discountText ?? ""));
  const merchantLogoUrl = extractOgImage(block) ?? extractImgSrc(block);

  const linkMatch = block.match(/href=["'](\/(?:offers|exclusive-offers)\/[^"'#?]{4,})["']/i);
  const detailUrl = linkMatch ? `${BASE_URL}${linkMatch[1]}` : sourceUrl;

  return {
    bank: "amex_ntb",
    bankDisplayName: "American Express (NTB)",
    title: title.substring(0, 300),
    merchant: merchant.substring(0, 200),
    description: cleanText(block).substring(0, 500) || undefined,
    ...discount,
    category,
    merchantLogoUrl,
    validFrom,
    validUntil,
    sourceUrl: detailUrl,
    scrapedAt: new Date(),
  };
}

/** Parse a full offer detail page as a single offer */
function parseOfferDetailPage(html: string, sourceUrl: string): Partial<OfferInput>[] {
  const offer = parseSingleOffer(html, sourceUrl);
  return offer ? [offer] : [];
}

function parseSingleOffer(html: string, sourceUrl: string): Partial<OfferInput> | null {
  const title = extractTitle(html);
  if (!title) return null;

  const bodyText = cleanText(html);
  const merchant = extractMerchantFromTitle(title);
  const discountText = extractDiscountText(html);
  const discount = parseDiscount(discountText ?? extractDiscountFromText(bodyText));
  const { validFrom, validUntil } = extractDates(bodyText);
  const category = detectCategory(merchant, bodyText);
  const merchantLogoUrl = extractOgImage(html) ?? extractImgSrc(html);

  const pMatch = html.match(/<p[^>]*>([\s\S]{10,500}?)<\/p>/i);
  const description = pMatch ? cleanText(pMatch[1]!).substring(0, 500) : undefined;

  return {
    bank: "amex_ntb",
    bankDisplayName: "American Express (NTB)",
    title: title.substring(0, 300),
    merchant: merchant.substring(0, 200),
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

// ── HTML extraction helpers ──────────────────────────────────────────────────

function extractTitle(html: string): string | undefined {
  const selectors = [
    /<[^>]+class=["'][^"']*(?:offer-title|promo-title|card-title)[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i,
    /<h1[^>]*>([\s\S]*?)<\/h1>/i,
    /<h2[^>]*>([\s\S]*?)<\/h2>/i,
    /<h3[^>]*>([\s\S]*?)<\/h3>/i,
  ];
  for (const re of selectors) {
    const m = html.match(re);
    if (m) {
      const text = cleanText(m[1]!);
      if (text.length >= 3) return text;
    }
  }
  return undefined;
}

function extractMerchant(html: string, fallback: string): string {
  const selectors = [
    /<[^>]+class=["'][^"']*(?:merchant-name|partner-name|offer-merchant)[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i,
  ];
  for (const re of selectors) {
    const m = html.match(re);
    if (m) {
      const text = cleanText(m[1]!);
      if (text.length >= 2) return text;
    }
  }
  return extractMerchantFromTitle(fallback);
}

function extractMerchantFromTitle(title: string): string {
  const atMatch = title.match(/\bat\s+(.+?)(?:\s+with\b|\s+for\b|\s+-|,|$)/i);
  if (atMatch) return cleanText(atMatch[1]!).substring(0, 100);
  const withMatch = title.match(/\bwith\s+(.+?)(?:\s+card|\s+bank|,|$)/i);
  if (withMatch) return cleanText(withMatch[1]!).substring(0, 100);
  return title.substring(0, 80);
}

function extractDiscountText(html: string): string | undefined {
  const selectors = [
    /<[^>]+class=["'][^"']*(?:offer-discount|promo-badge|discount-label|discount-text|offer-badge)[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i,
  ];
  for (const re of selectors) {
    const m = html.match(re);
    if (m) {
      const text = cleanText(m[1]!);
      if (text.length >= 2) return text;
    }
  }
  return undefined;
}

function extractDiscountFromText(text: string): string | undefined {
  const m = text.match(
    /(up\s+to\s+[\d]+%(?:\s+\w+)?|[\d]+%\s+(?:off|discount|cashback|savings?)|[\d]+\s*month\s+0%\s+install?ments?|buy\s+\d+\s+get\s+\d+|complimentary\s+\w+)/i
  );
  return m ? m[0].trim() : undefined;
}

function extractOgImage(html: string): string | undefined {
  const m1 = html.match(/<meta\b[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  if (m1?.[1]) return m1[1];
  const m2 = html.match(/<meta\b[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  if (m2?.[1]) return m2[1];
  return undefined;
}

function extractImgSrc(html: string): string | undefined {
  // Look for a logo or merchant image — skip tiny icons/tracking pixels
  const m = html.match(/<img\b[^>]+src=["'](https?:\/\/[^"']+\.(?:png|jpg|jpeg|webp|svg))["'][^>]*>/i);
  return m?.[1];
}

function extractDates(text: string): { validFrom?: Date; validUntil?: Date } {
  let validFrom: Date | undefined;
  let validUntil: Date | undefined;

  // "valid from DD Month YYYY to DD Month YYYY"
  const rangeRe =
    /valid\s+from\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\w+)(?:\s+(\d{4}))?\s+to\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\w+)\s+(\d{4})/i;
  const rangeMatch = text.match(rangeRe);
  if (rangeMatch) {
    const [, fromDay, fromMonth, fromYear, toDay, toMonth, toYear] = rangeMatch;
    validFrom = buildDate(fromDay!, fromMonth!, fromYear ?? toYear!);
    validUntil = buildDate(toDay!, toMonth!, toYear!);
    return { validFrom, validUntil };
  }

  // "valid till/until/through DD Month YYYY"
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
