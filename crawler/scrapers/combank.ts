/**
 * Commercial Bank (combank.lk) offer scraper
 * Spec: specs/features/002-crawler.md
 *
 * Strategy (2-phase):
 *   1. Fetch listing page (combank.lk/rewards-promotions) and extract all
 *      offer URLs matching /rewards-promotion/[category]/[slug].
 *   2. Fetch each detail page and parse:
 *        - <h2> title
 *        - discount text (e.g. "15% discount", "Up to 45% off")
 *        - validity ("Offer valid till 30th April 2026")
 *        - merchant (extracted from title + URL slug)
 *        - category (from URL path segment)
 *   Detail pages are fetched with concurrency=5 and a polite delay.
 */
import { OfferInputSchema, type OfferInput } from "../../specs/data/offer.schema";
import { fetchHtml, pLimit, sleep } from "../utils/http";
import { parseDiscount } from "../utils/parseDiscount";

const LISTING_URL = "https://www.combank.lk/rewards-promotions";
const BASE_URL = "https://www.combank.lk";

/** URL path category segment → our schema enum */
const CATEGORY_MAP: Record<string, OfferInput["category"]> = {
  "food-restaurants": "dining",
  "food": "dining",
  "restaurants": "dining",
  "dining": "dining",
  "leisure": "travel",
  "travel": "travel",
  "hotel": "travel",
  "seasonal-offers": "other",
  "seasonal": "other",
  "online-shopping": "online",
  "online": "online",
  "shopping": "shopping",
  "health": "health",
  "health-wellness": "health",
  "wellness": "health",
  "fuel": "fuel",
  "groceries": "groceries",
  "supermarket": "groceries",
  "entertainment": "entertainment",
};

const MONTH_MAP: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4,
  may: 5, june: 6, july: 7, august: 8,
  september: 9, october: 10, november: 11, december: 12,
};

export async function scrape(): Promise<OfferInput[]> {
  console.log("[combank] Starting scrape…");
  const offers: OfferInput[] = [];

  try {
    // Phase 1: get offer URLs from listing page
    const listingHtml = await fetchHtml(LISTING_URL);
    const offerLinks = extractOfferLinks(listingHtml);
    console.log(`[combank] Found ${offerLinks.length} offer links`);

    if (offerLinks.length === 0) {
      console.warn("[combank] No offer links found — page structure may have changed");
    }

    // Phase 2: fetch each detail page (max 5 concurrent, 800 ms gap)
    const tasks = offerLinks.map(({ url, category }) => async () => {
      try {
        await sleep(800);
        const detailHtml = await fetchHtml(url, 0);
        return parseDetailPage(detailHtml, url, category);
      } catch (err) {
        console.warn(`[combank] Failed to fetch ${url}:`, (err as Error).message);
        return null;
      }
    });

    const results = await pLimit(tasks, 5);

    for (const raw of results) {
      if (!raw) continue;
      const result = OfferInputSchema.safeParse(raw);
      if (result.success) {
        offers.push(result.data);
      } else {
        console.warn("[combank] Offer failed validation:", result.error.flatten());
      }
    }
  } catch (err) {
    console.error("[combank] Scrape failed:", err);
    throw err;
  }

  console.log(`[combank] Scraped ${offers.length} valid offers`);
  return offers;
}

/** Extract all unique /rewards-promotion/[category]/[slug] links */
function extractOfferLinks(html: string): Array<{ url: string; category: OfferInput["category"] }> {
  const seen = new Set<string>();
  const links: Array<{ url: string; category: OfferInput["category"] }> = [];

  // Match href="/rewards-promotion/category/slug" or full URLs
  const re = /href="((?:https?:\/\/www\.combank\.lk)?\/rewards-promotion\/([^/"]+)\/[^"]+)"/gi;
  let m: RegExpExecArray | null;

  while ((m = re.exec(html)) !== null) {
    const path = m[1].startsWith("http") ? new URL(m[1]).pathname : m[1];
    const fullUrl = `${BASE_URL}${path}`;
    const categorySlug = m[2].toLowerCase();

    if (!seen.has(fullUrl)) {
      seen.add(fullUrl);
      links.push({
        url: fullUrl,
        category: CATEGORY_MAP[categorySlug] ?? detectCategoryFromSlug(categorySlug),
      });
    }
  }

  return links;
}

/** Parse a ComBank offer detail page */
function parseDetailPage(
  html: string,
  sourceUrl: string,
  category: OfferInput["category"]
): Partial<OfferInput> | null {
  // Title: first <h2> on the page
  const title = extractFirst(html, /<h2[^>]*>([\s\S]*?)<\/h2>/i);
  if (!title) return null;

  const cleanTitle = cleanText(title);
  const merchant = extractMerchant(cleanTitle, sourceUrl);
  const discount = parseDiscount(extractDiscount(html));
  const { validFrom, validUntil } = extractDates(html);
  const description = extractDescription(html, cleanTitle);

  // Image: try og:image (handles both attribute orderings), then any CDN img
  const merchantLogoUrl = toValidUrl(extractOgImage(html) ?? extractFeaturedImage(html));

  return {
    bank: "commercial_bank",
    bankDisplayName: "Commercial Bank",
    title: cleanTitle,
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
 * Extract merchant from title.
 * Patterns: "...at Blue Orbit by Citrus with...", "...at Cinnamon Grand..."
 */
function extractMerchant(title: string, sourceUrl: string): string {
  const atMatch = title.match(/\bat\s+(.+?)(?:\s+with\b|\s+for\b|\s+using\b|\s+–|\s+-|,|\s+is\b|$)/i);
  if (atMatch) return cleanText(atMatch[1]).substring(0, 100);

  // Fall back to last segment of URL slug, humanised
  const slug = sourceUrl.split("/").pop() ?? "";
  return slug
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .substring(0, 80);
}

/** Extract discount text from page body */
function extractDiscount(html: string): string | undefined {
  const text = cleanText(html);
  const match = text.match(
    /(up\s+to\s+[\d]+%(?:\s+\w+)?|[\d]+%\s+(?:off|discount|cashback|savings?)|[\d]+%)/i
  );
  return match ? match[0].trim() : undefined;
}

/** Extract validity dates from page text */
function extractDates(html: string): { validFrom?: Date; validUntil?: Date } {
  const text = cleanText(html);
  let validFrom: Date | undefined;
  let validUntil: Date | undefined;

  // "valid from DD Month YYYY to DD Month YYYY"
  const rangeRe =
    /valid\s+from\s+(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)(?:\s+(\d{4}))?\s+to\s+(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i;
  const rangeMatch = text.match(rangeRe);
  if (rangeMatch) {
    const [, fromDay, fromMonth, fromYear, toDay, toMonth, toYear] = rangeMatch;
    const year = fromYear ?? toYear;
    validFrom = buildDate(fromDay, fromMonth, year ?? toYear);
    validUntil = buildDate(toDay, toMonth, toYear);
    return { validFrom, validUntil };
  }

  // "valid till DD Month YYYY"
  const tillRe =
    /valid\s+(?:till|until|through)\s+(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i;
  const tillMatch = text.match(tillRe);
  if (tillMatch) {
    const [, day, month, year] = tillMatch;
    validUntil = buildDate(day, month, year);
  }

  return { validFrom, validUntil };
}

function buildDate(day: string, month: string, year: string): Date | undefined {
  const m = MONTH_MAP[month.toLowerCase()];
  if (!m || !year) return undefined;
  const d = new Date(
    parseInt(year, 10),
    m - 1,
    parseInt(day, 10)
  );
  return isNaN(d.getTime()) ? undefined : d;
}

/** Extract short description from the first <p> after the heading */
function extractDescription(html: string, title: string): string | undefined {
  // Remove the title heading from text, then take first real paragraph
  const pMatch = html.match(/<p[^>]*>([\s\S]{20,300}?)<\/p>/i);
  if (!pMatch) return undefined;
  const text = cleanText(pMatch[1]);
  // Avoid returning the title itself
  if (text.toLowerCase() === title.toLowerCase()) return undefined;
  return text.substring(0, 300) || undefined;
}

function extractFirst(html: string, pattern: RegExp): string | undefined {
  const m = html.match(pattern);
  return m ? cleanText(m[1]) : undefined;
}

function detectCategoryFromSlug(slug: string): OfferInput["category"] {
  if (/food|dining|restaurant|cafe/.test(slug)) return "dining";
  if (/travel|hotel|leisure/.test(slug)) return "travel";
  if (/fuel/.test(slug)) return "fuel";
  if (/grocery|supermarket/.test(slug)) return "groceries";
  if (/entertainment/.test(slug)) return "entertainment";
  if (/health|wellness/.test(slug)) return "health";
  if (/online/.test(slug)) return "online";
  if (/shopping/.test(slug)) return "shopping";
  return "other";
}

/**
 * Extract og:image — handles both attribute orderings in the <meta> tag.
 */
/**
 * Extract og:image — handles both attribute orderings.
 * Only returns the value if it is an absolute URL; ComBank sets og:image to a
 * site-wide relative path (/assets/…) on generic pages, which we ignore.
 */
function extractOgImage(html: string): string | undefined {
  const candidates: (string | undefined)[] = [
    html.match(/<meta\b[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1],
    html.match(/<meta\b[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)?.[1],
  ];
  // Only return absolute URLs — ignore relative paths like /assets/images/og/og.jpg
  return candidates.find((u) => u && /^https?:\/\//i.test(u));
}

/**
 * Extract the most relevant absolute image from the page HTML.
 * Prefers CDN URLs that look like offer / promotion images, then falls back
 * to the first absolute <img src>.
 */
function extractFeaturedImage(html: string): string | undefined {
  const imgRe = /<img\b[^>]+src=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/gi;
  const srcs: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(html)) !== null && srcs.length < 20) {
    if (m[1]) srcs.push(m[1]);
  }
  // Prefer URLs whose path clearly belongs to an offer / promotion
  return (
    srcs.find((u) => /offers?|promo|shares|banner|campaign/i.test(u)) ?? srcs[0]
  );
}

/**
 * Decode HTML entities in a URL string and validate it.
 * og:image URLs often contain &amp; instead of & which fails URL validation.
 * Returns undefined if the URL is missing or invalid after decoding.
 */
function toValidUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const decoded = raw
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .trim();
  try {
    new URL(decoded);
    return decoded;
  } catch {
    return undefined;
  }
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
