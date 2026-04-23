/**
 * American Express NTB (americanexpress.lk) offer scraper
 * Spec: specs/features/010-amex-offers.md
 *
 * NTB issues all Sri Lankan American Express cards via americanexpress.lk,
 * which uses Incapsula/Imperva bot protection similar to nationstrust.com.
 *
 * Strategy:
 *   1. Use Crawlee PlaywrightCrawler for Incapsula bypass (fingerprint injection, stealth)
 *   2. LISTING label: load /offers → collect detail links, or extract inline cards
 *   3. DETAIL label: load each detail page → extract offer via DOM API
 *   4. Any error → return [] and log a warning (never crash the crawl)
 */
import { OfferInputSchema, type OfferInput } from "../../specs/data/offer.schema";
import { parseDiscount } from "../utils/parseDiscount";

const BASE_URL = "https://www.americanexpress.lk";
const LISTING_URL = "https://www.americanexpress.lk/offers";

const MONTH_MAP: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4,
  may: 5, june: 6, july: 7, august: 8,
  september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4,
  jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const REQUEST_LABELS = {
  LISTING: "LISTING",
  DETAIL: "DETAIL",
} as const;

export async function scrape(): Promise<OfferInput[]> {
  console.log("[amex] Starting scrape with Crawlee…");

  // Set Crawlee storage to a temp dir to avoid polluting the repo
  process.env.CRAWLEE_STORAGE_DIR = "/tmp/crawlee-amex";

  const allOffers: OfferInput[] = [];

  try {
    const { PlaywrightCrawler, log } = await import("crawlee");

    // Suppress Crawlee's verbose internal logging
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
        requestHandlerTimeoutSecs: 60,

        async requestHandler({ page, request, addRequests }) {
          const { url, label } = request;

          await page.waitForLoadState("networkidle");

          // Check if blocked by Incapsula
          const bodyText: string = await page.evaluate(
            () => (document as Document).body?.innerText ?? ""
          );
          if (bodyText.includes("Incapsula incident ID")) {
            console.warn(`[amex] Page blocked by Incapsula: ${url}`);
            return;
          }

          if (label === REQUEST_LABELS.LISTING) {
            // Try to find offer detail links first
            const links: string[] = await page.$$eval(
              "a[href]",
              (anchors: Element[]) =>
                anchors
                  .map((a) => (a as HTMLAnchorElement).href)
                  .filter((href) =>
                    /americanexpress\.lk\/(offers|exclusive-offers)\/[^/#?]{4,}/.test(href)
                  )
            );

            const unique = [...new Set(links)];
            console.log(`[amex] LISTING: found ${unique.length} detail links`);

            if (unique.length > 0) {
              await addRequests(
                unique.map((href) => ({
                  url: href.startsWith("http") ? href : `${BASE_URL}${href}`,
                  label: REQUEST_LABELS.DETAIL,
                }))
              );
              return;
            }

            // No detail links — try to extract offer cards inline from the listing page
            console.log("[amex] LISTING: no detail links found, trying inline card extraction");

            type CardData = { title: string; merchant: string; discount: string; detailUrl: string };
            const cards: CardData[] = await page.evaluate((): CardData[] => {
              const results: CardData[] = [];

              // Query elements whose class contains "offer", "promo", or "card"
              const allEls = Array.from(
                (document as Document).querySelectorAll<HTMLElement>(
                  '[class*="offer"], [class*="promo"], [class*="card"]'
                )
              );

              for (const el of allEls) {
                // Must have reasonable content
                const text = el.innerText?.trim() ?? "";
                if (text.length < 10) continue;

                // Avoid deeply nested duplicates — only pick top-level matches
                if (el.parentElement?.matches('[class*="offer"], [class*="promo"], [class*="card"]')) {
                  continue;
                }

                const titleEl = el.querySelector<HTMLElement>("h1, h2, h3, h4, [class*='title']");
                const discountEl = el.querySelector<HTMLElement>(
                  '[class*="discount"], [class*="badge"], [class*="saving"], [class*="percent"]'
                );
                const linkEl = el.querySelector<HTMLAnchorElement>("a[href]");

                const title = titleEl?.innerText?.trim() ?? text.substring(0, 80);
                const discount = discountEl?.innerText?.trim() ?? "";
                const merchant = title.substring(0, 80);
                const detailUrl = linkEl?.href ?? "";

                if (title.length >= 3) {
                  results.push({ title, merchant, discount, detailUrl });
                }
              }

              return results;
            });

            console.log(`[amex] LISTING inline: found ${cards.length} offer cards`);

            for (const card of cards) {
              if (!card.title) continue;

              const discount = parseDiscount(card.discount || undefined);
              const { validFrom, validUntil } = extractDates(card.title);
              const category = detectCategory(card.merchant, card.title + " " + (card.discount ?? ""));

              const raw: Partial<OfferInput> = {
                bank: "amex_ntb",
                bankDisplayName: "American Express (NTB)",
                title: card.title.substring(0, 300),
                merchant: extractMerchantFromTitle(card.merchant).substring(0, 200),
                ...discount,
                category,
                validFrom,
                validUntil,
                sourceUrl: card.detailUrl || url,
                scrapedAt: new Date(),
              };

              const result = OfferInputSchema.safeParse(raw);
              if (result.success) {
                allOffers.push(result.data);
              } else {
                console.warn("[amex] Inline card failed validation:", result.error.flatten());
              }
            }
          } else if (label === REQUEST_LABELS.DETAIL) {
            // Extract offer from detail page using DOM API
            const title: string | null = await page
              .$eval("h1, h2", (el: Element) => (el as HTMLElement).innerText?.trim() ?? "")
              .catch(() => null);

            if (!title || title.length < 3) {
              console.warn(`[amex] DETAIL ${url}: no title found`);
              return;
            }

            const discountText: string | null = await page
              .$eval(
                '[class*="discount"], [class*="badge"], [class*="saving"]',
                (el: Element) => (el as HTMLElement).innerText?.trim() ?? ""
              )
              .catch(() => null);

            const merchantLogoUrl: string | null = await page.evaluate(
              () =>
                (document as Document).querySelector<HTMLMetaElement>(
                  'meta[property="og:image"]'
                )?.content ?? null
            );

            const bodyText2: string = await page.evaluate(
              () => (document as Document).body?.innerText ?? ""
            );

            const merchant = extractMerchantFromTitle(title);
            const discount = parseDiscount(
              discountText || extractDiscountFromText(bodyText2) || undefined
            );
            const { validFrom, validUntil } = extractDates(bodyText2);
            const category = detectCategory(merchant, bodyText2);

            console.log(`[amex] DETAIL ${url}: extracted offer "${title.substring(0, 50)}"`);

            const raw: Partial<OfferInput> = {
              bank: "amex_ntb",
              bankDisplayName: "American Express (NTB)",
              title: title.substring(0, 300),
              merchant: merchant.substring(0, 200),
              ...discount,
              category,
              merchantLogoUrl: merchantLogoUrl ?? undefined,
              validFrom,
              validUntil,
              sourceUrl: url,
              scrapedAt: new Date(),
            };

            const result = OfferInputSchema.safeParse(raw);
            if (result.success) {
              allOffers.push(result.data);
            } else {
              console.warn("[amex] Detail offer failed validation:", result.error.flatten());
            }
          }
        },

        failedRequestHandler({ request }) {
          console.warn(`[amex] Request failed: ${request.url}`);
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
    console.error("[amex] Crawlee scrape failed:", err);
    return [];
  }

  console.log(`[amex] Scraped ${allOffers.length} valid offers`);
  return allOffers;
}

// ── Parsing helpers (kept from original — they work correctly) ───────────────

function extractMerchantFromTitle(title: string): string {
  const atMatch = title.match(/\bat\s+(.+?)(?:\s+with\b|\s+for\b|\s+-|,|$)/i);
  if (atMatch) return cleanText(atMatch[1]!).substring(0, 100);
  const withMatch = title.match(/\bwith\s+(.+?)(?:\s+card|\s+bank|,|$)/i);
  if (withMatch) return cleanText(withMatch[1]!).substring(0, 100);
  return title.substring(0, 80);
}

function extractDiscountFromText(text: string): string | undefined {
  const m = text.match(
    /(up\s+to\s+[\d]+%(?:\s+\w+)?|[\d]+%\s+(?:off|discount|cashback|savings?)|[\d]+\s*month\s+0%\s+install?ments?|buy\s+\d+\s+get\s+\d+|complimentary\s+\w+)/i
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
