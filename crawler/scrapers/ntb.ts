/**
 * Nations Trust Bank (nationstrust.com) offer scraper
 * Spec: specs/features/008-playwright-ntb-fallback.md
 *
 * NTB uses Incapsula/Imperva bot protection that blocks plain HTTP requests.
 * Strategy:
 *   1. Use Crawlee PlaywrightCrawler for Incapsula bypass (fingerprint injection, stealth)
 *   2. LISTING label: load /promotions/what-s-new → collect campaign detail links
 *   3. CAMPAIGN label: load each campaign page → extract offer rows from <table>
 *   4. On any error: log warning and return [] — never crash the crawl
 */
import { OfferInputSchema, type OfferInput } from "../../specs/data/offer.schema";
import { parseDiscount } from "../utils/parseDiscount";

const BASE_URL = "https://www.nationstrust.com";
const PROMOTIONS_URL = "https://www.nationstrust.com/promotions/what-s-new";

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
  console.log("[ntb] Starting scrape with Crawlee…");

  // Set Crawlee storage to a temp dir to avoid polluting the repo
  process.env.CRAWLEE_STORAGE_DIR = "/tmp/crawlee-ntb";

  const allOffers: OfferInput[] = [];

  try {
    const { PlaywrightCrawler, log } = await import("crawlee");

    // Suppress Crawlee's verbose internal logging
    log.setLevel(log.LEVELS.ERROR);

    await new Promise<void>((resolve, reject) => {
      let crawlerError: Error | null = null;

      const crawler = new PlaywrightCrawler({
        headless: true,
        launchContext: {
          launchOptions: {
            args: ["--no-sandbox", "--disable-dev-shm-usage"],
          },
        },
        maxRequestsPerCrawl: 60,
        requestHandlerTimeoutSecs: 60,

        async requestHandler({ page, request, addRequests }) {
          const { url, label } = request;

          await page.waitForLoadState("networkidle");

          // Check if blocked by Incapsula
          const bodyText: string = await page.evaluate(
            () => (document as Document).body?.innerText ?? ""
          );
          if (bodyText.includes("Incapsula incident ID")) {
            console.warn(`[ntb] Page blocked by Incapsula: ${url}`);
            return;
          }

          if (label === REQUEST_LABELS.LISTING) {
            // Extract all campaign detail links from the listing page
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
            console.log(`[ntb] LISTING: found ${unique.length} campaign links`);

            if (unique.length === 0) {
              console.warn("[ntb] LISTING: no campaign links found — page may be empty or blocked");
              return;
            }

            await addRequests(
              unique.map((href) => ({
                url: href.startsWith("http") ? href : `${BASE_URL}${href}`,
                label: REQUEST_LABELS.CAMPAIGN,
              }))
            );
          } else if (label === REQUEST_LABELS.CAMPAIGN) {
            // Extract offer rows from <table> using DOM API
            type RowData = { merchant: string; offerText: string; eligibility: string };
            const rows: RowData[] = await page.$$eval(
              "table tr",
              (trs: Element[]) => {
                const results: RowData[] = [];
                trs.forEach((tr, idx) => {
                  if (idx === 0) return; // skip header row
                  const cells = tr.querySelectorAll("td, th");
                  if (cells.length < 2) return;
                  results.push({
                    merchant: (cells[0] as HTMLElement).innerText?.trim() ?? "",
                    offerText: (cells[1] as HTMLElement).innerText?.trim() ?? "",
                    eligibility: cells[2] ? (cells[2] as HTMLElement).innerText?.trim() ?? "" : "",
                  });
                });
                return results;
              }
            );

            console.log(`[ntb] CAMPAIGN ${url}: found ${rows.length} table rows`);

            if (rows.length === 0) {
              // Fallback: treat page as a single offer
              const singleOffer = await extractSingleOffer(page, url);
              if (singleOffer) {
                const result = OfferInputSchema.safeParse(singleOffer);
                if (result.success) allOffers.push(result.data);
                else console.warn("[ntb] Single offer failed validation:", result.error.flatten());
              }
              return;
            }

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
          }
        },

        failedRequestHandler({ request }) {
          console.warn(`[ntb] Request failed: ${request.url}`);
        },
      });

      crawler
        .run([{ url: PROMOTIONS_URL, label: REQUEST_LABELS.LISTING }])
        .then(() => resolve())
        .catch((err: unknown) => {
          crawlerError = err instanceof Error ? err : new Error(String(err));
          reject(crawlerError);
        });
    });
  } catch (err) {
    console.error("[ntb] Crawlee scrape failed:", err);
    return [];
  }

  console.log(`[ntb] Scraped ${allOffers.length} valid offers`);
  return allOffers;
}

/** Extract a single offer from the page using DOM API (fallback for non-table pages) */
async function extractSingleOffer(
  page: import("playwright").Page,
  sourceUrl: string
): Promise<Partial<OfferInput> | null> {
  try {
    const title: string | null = await page
      .$eval("h1, h2", (el: Element) => (el as HTMLElement).innerText?.trim() ?? "")
      .catch(() => null);

    if (!title || title.length < 3) return null;

    const bodyText: string = await page.evaluate(
      () => (document as Document).body?.innerText ?? ""
    );

    const merchantLogoUrl: string | null = await page.evaluate(
      () =>
        (document as Document).querySelector<HTMLMetaElement>('meta[property="og:image"]')
          ?.content ?? null
    );

    const merchant = extractMerchant(title);
    const discount = parseDiscount(extractDiscount(bodyText));
    const { validFrom, validUntil } = extractDates(bodyText);
    const category = detectCategory(title, bodyText);

    return {
      bank: "nations_trust_bank",
      bankDisplayName: "Nations Trust Bank",
      title: title.substring(0, 300),
      merchant,
      ...discount,
      category,
      merchantLogoUrl: merchantLogoUrl ?? undefined,
      validFrom,
      validUntil,
      sourceUrl,
      scrapedAt: new Date(),
    };
  } catch {
    return null;
  }
}

// ── Parsing helpers (unchanged from original — they work correctly) ──────────

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
