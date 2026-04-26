/**
 * Nations Trust Bank (nationstrust.com) offer scraper
 * Spec: specs/features/008-playwright-ntb-fallback.md
 *
 * NTB is protected by Incapsula/Imperva. Strategy:
 *   1. Try plain HTTP first — works from residential IPs (fast, no browser overhead)
 *   2. If Incapsula blocks the HTTP response, fall back to Crawlee PlaywrightCrawler
 *      which runs a real Chromium browser and can pass JS challenges.
 *   3. Crawlee uses LISTING → CAMPAIGN two-phase navigation to find offer tables.
 *   4. On any error: log warning and return [] — never crash the crawl.
 *
 * Note on waitForLoadState: we use "load" (not "networkidle") because Incapsula's
 * challenge JS polls the network continuously, causing "networkidle" to time out.
 * After "load" we wait 3 s for the challenge redirect to complete.
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

const REQUEST_LABELS = {
  LISTING: "LISTING",
  CAMPAIGN: "CAMPAIGN",
} as const;

export async function scrape(): Promise<OfferInput[]> {
  console.log("[ntb] Starting scrape…");

  // Step 1: Try plain HTTP first (works from residential IPs)
  const httpOffers = await scrapeViaHttp();
  if (httpOffers !== null) {
    console.log(`[ntb] HTTP path: scraped ${httpOffers.length} valid offers`);
    return httpOffers;
  }

  // Step 2: HTTP blocked — fall back to Crawlee Playwright
  console.log("[ntb] HTTP blocked, falling back to Crawlee PlaywrightCrawler…");
  return scrapeWithCrawlee();
}

// ── HTTP path ────────────────────────────────────────────────────────────────

/**
 * Returns the list of offers scraped via plain HTTP, or null if Incapsula blocks.
 */
async function scrapeViaHttp(): Promise<OfferInput[] | null> {
  const cookieJar = new Map<string, string>();

  try {
    const listingHtml = await fetchHtmlSessioned(LISTING_URL, cookieJar, BASE_URL, 0);

    if (isBlockPage(listingHtml)) {
      console.warn("[ntb] HTTP: listing page is blocked by Incapsula");
      return null;
    }

    const campaignLinks = extractCampaignLinks(listingHtml);
    console.log(`[ntb] HTTP: found ${campaignLinks.length} campaign links`);

    if (campaignLinks.length === 0) return null;

    const allOffers: OfferInput[] = [];

    for (const url of campaignLinks) {
      await sleep(400);
      try {
        const html = await fetchHtmlSessioned(url, cookieJar, LISTING_URL, 0);
        if (isBlockPage(html)) {
          console.warn(`[ntb] HTTP: campaign page blocked: ${url}`);
          continue;
        }
        const rows = parseCampaignTable(html);
        console.log(`[ntb] HTTP ${url}: ${rows.length} rows`);
        pushValidOffers(rows, url, allOffers);
      } catch (err) {
        console.warn(`[ntb] HTTP: failed to fetch ${url}:`, (err as Error).message);
      }
    }

    return allOffers;
  } catch (err) {
    console.warn("[ntb] HTTP path failed:", (err as Error).message);
    return null;
  }
}

// ── Crawlee Playwright path ──────────────────────────────────────────────────

async function scrapeWithCrawlee(): Promise<OfferInput[]> {
  process.env.CRAWLEE_STORAGE_DIR = "/tmp/crawlee-ntb";

  const allOffers: OfferInput[] = [];

  try {
    const { PlaywrightCrawler, log } = await import("crawlee");
    log.setLevel(log.LEVELS.ERROR);

    await new Promise<void>((resolve, reject) => {
      const crawler = new PlaywrightCrawler({
        headless: true,
        launchContext: {
          launchOptions: {
            args: ["--no-sandbox", "--disable-dev-shm-usage"],
          },
        },
        maxRequestsPerCrawl: 60,
        requestHandlerTimeoutSecs: 90,

        async requestHandler({ page, request, addRequests }) {
          const { url, label } = request;

          if (label === REQUEST_LABELS.LISTING) {
            // Wait for an actual promotion link — this handles the Incapsula challenge
            // redirect transparently: the selector won't match until the real page loads.
            try {
              await page.waitForSelector('a[href*="/promotions/what-s-new/"]', { timeout: 45000 });
            } catch {
              const bodyText: string = await page.evaluate(
                () => (document as Document).body?.innerText ?? ""
              ).catch(() => "");
              if (isBlockPage(bodyText)) {
                console.warn(`[ntb] Crawlee LISTING: page blocked by Incapsula`);
              } else {
                console.warn(`[ntb] Crawlee LISTING: content selector timed out on ${url}`);
              }
              return;
            }

            const links: string[] = await page.$$eval(
              "a[href]",
              (anchors: Element[]) =>
                anchors
                  .map((a) => (a as HTMLAnchorElement).href)
                  .filter((href) =>
                    /\/promotions\/[^/#?]{5,}\/[^/#?]{5,}/.test(href)
                  )
            );

            const unique = [...new Set(links)];
            console.log(`[ntb] Crawlee LISTING: found ${unique.length} campaign links`);

            await addRequests(
              unique.map((href) => ({
                url: href.startsWith("http") ? href : `${BASE_URL}${href}`,
                label: REQUEST_LABELS.CAMPAIGN,
              }))
            );
          } else if (label === REQUEST_LABELS.CAMPAIGN) {
            // Wait for a table (offer table) to appear before extracting HTML
            try {
              await page.waitForSelector("table", { timeout: 30000 });
            } catch {
              console.warn(`[ntb] Crawlee CAMPAIGN: no table found on ${url}`);
            }

            const html: string = await page.evaluate(
              () => (document as Document).documentElement?.outerHTML ?? ""
            );

            const rows = parseCampaignTable(html);
            console.log(`[ntb] Crawlee CAMPAIGN ${url}: ${rows.length} rows`);
            pushValidOffers(rows, url, allOffers);
          }
        },

        failedRequestHandler({ request }) {
          console.warn(`[ntb] Crawlee: request failed: ${request.url}`);
        },
      });

      crawler
        .run([{ url: LISTING_URL, label: REQUEST_LABELS.LISTING }])
        .then(() => resolve())
        .catch((err: unknown) => {
          reject(err instanceof Error ? err : new Error(String(err)));
        });
    });
  } catch (err) {
    console.error("[ntb] Crawlee scrape failed:", err);
    return [];
  }

  console.log(`[ntb] Crawlee: scraped ${allOffers.length} valid offers`);
  return allOffers;
}

// ── Shared helpers ───────────────────────────────────────────────────────────

function pushValidOffers(rows: OfferRow[], sourceUrl: string, out: OfferInput[]): void {
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
      sourceUrl,
      scrapedAt: new Date(),
    };

    const result = OfferInputSchema.safeParse(raw);
    if (result.success) {
      out.push(result.data);
    } else {
      console.warn("[ntb] Offer failed validation:", result.error.flatten());
    }
  }
}

// ── HTML parsing helpers ─────────────────────────────────────────────────────

/** Returns true if the text/HTML is an Incapsula block/challenge page */
function isBlockPage(html: string): boolean {
  return (
    html.includes("Incapsula incident ID") ||
    html.includes("Request unsuccessful. Incapsula incident ID")
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
 * Parse offer table rows, stripping HTML comments so expired rows are excluded.
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
