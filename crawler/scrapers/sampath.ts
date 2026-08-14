/**
 * Sampath Bank (sampath.lk) offer scraper
 * Spec: specs/features/002-crawler.md
 * Spec: specs/features/062-sampath-api-empty-response-fix.md
 */
import { OfferInputSchema, type OfferInput } from "../../specs/data/offer.schema";
import { fetchJson } from "../utils/http";
import { parseDiscount } from "../utils/parseDiscount";
import { getConfiguredProviders, getBankProviderMap, orderedProvidersForBank } from "../utils/proxyProviders/registry";

const API_URL = "https://www.sampath.lk/api/card-promotions?page_number=1&size=200";
const SOURCE_URL = "https://www.sampath.lk/sampath-cards/credit-card-offer";
const DETAIL_BASE = "https://www.sampath.lk/sampath-cards/credit-card-offer";
const EXTRA_HEADERS = { Referer: "https://www.sampath.lk/sampath-cards/credit-card-offer" };
const CATEGORY_MAP: Record<string, OfferInput["category"]> = {
  dining: "dining", food: "dining", restaurant: "dining", "food & beverage": "dining",
  shopping: "shopping", fashion: "shopping", retail: "shopping", electronics_and_furniture: "shopping",
  travel: "travel", hotel: "travel", hotels: "travel", leisure: "travel", travel_and_leisure: "travel",
  fuel: "fuel", petrol: "fuel",
  grocery: "groceries", groceries: "groceries", supermarket: "groceries", super_markets: "groceries",
  entertainment: "entertainment", cinema: "entertainment",
  health: "healthcare", pharmacy: "healthcare", medical: "healthcare", health_and_insurance: "healthcare", wellness: "wellness",
  online: "online", "e-commerce": "online",
};
const JUNK_NAME_PATTERNS = [/^exclusive offers for/i, /^offers for (visa|mastercard|sampath)/i];
interface SampathCardEntry { title?: string; description?: string; icon_url?: string; order_id?: number; }
interface SampathPromotion { id?: number; company_name?: string; short_discount?: string; description?: string; category?: string; expire_on?: number; display_on?: number; image_url?: string; cards_new?: SampathCardEntry[]; }
function buildDetailUrl(id: number | undefined): string | undefined { if (!id || isNaN(id)) return undefined; return `${DETAIL_BASE}/${id}`; }
type SampathApiResponse = SampathPromotion[] | { data: SampathPromotion[] } | Record<string, unknown>;
export async function scrape(): Promise<OfferInput[]> {
  console.log("[sampath] Starting scrape…");
  const offers: OfferInput[] = [];
  try {
    let raw: SampathApiResponse | undefined;
    let fetchError: Error | undefined;
    try { raw = await fetchJson<SampathApiResponse>(API_URL, 1000, 2, EXTRA_HEADERS); } catch (err) {
      fetchError = err as Error;
      const providers = orderedProvidersForBank("sampath_bank", getConfiguredProviders(), getBankProviderMap());
      if (providers.length > 0) {
        let lastErr: Error | undefined = fetchError;
        for (const provider of providers) {
          try {
            console.log(`[sampath] Direct fetch failed (${fetchError.message}), retrying via ${provider.name}…`);
            const body = await provider.fetchHtml(API_URL, "sampath_bank");
            try { raw = JSON.parse(body) as SampathApiResponse; fetchError = undefined; break; } catch { raw = {} as SampathApiResponse; fetchError = undefined; break; }
          } catch (e) { lastErr = e as Error; console.warn(`[sampath] Provider ${provider.name} failed for sampath_bank (${API_URL}):`, lastErr.message); }
        }
        if (fetchError) throw lastErr ?? fetchError;
      } else { throw fetchError; }
    }
    let promotions = extractPromotionList(raw!);
    if (promotions.length === 0) {
      try { const rawStr = JSON.stringify(raw); const truncated = rawStr.length > 2048 ? rawStr.slice(0, 2048) + "…[truncated]" : rawStr; console.warn(`[sampath] API returned 0 promotions — raw response (truncated 2KB): ${truncated}`); } catch { console.warn("[sampath] API returned 0 promotions — check response shape (raw not stringifiable)"); }
      // AC2: zero-result proxy fallback — retry via orderedProvidersForBank when direct fetch returned 0
      const zeroProviders = orderedProvidersForBank("sampath_bank", getConfiguredProviders(), getBankProviderMap());
      if (zeroProviders.length > 0) {
        for (const provider of zeroProviders) {
          try {
            console.log(`[sampath] Direct fetch returned 0 promotions, retrying via ${provider.name}…`);
            const body = await provider.fetchHtml(API_URL, "sampath_bank");
            let parsed: SampathApiResponse;
            try { parsed = JSON.parse(body) as SampathApiResponse; } catch { continue; }
            const proxyPromotions = extractPromotionList(parsed);
            if (proxyPromotions.length > 0) {
              raw = parsed;
              promotions = proxyPromotions;
              break;
            }
          } catch (e) {
            console.warn(`[sampath] Provider ${provider.name} failed for sampath_bank zero-fallback (${API_URL}):`, (e as Error).message);
          }
        }
      }
    }
    let skipped = 0;
    for (const item of promotions) {
      const name = item.company_name?.trim() ?? "";
      if (JUNK_NAME_PATTERNS.some((re) => re.test(name))) { skipped++; continue; }
      const mapped = mapPromotion(item);
      const result = OfferInputSchema.safeParse(mapped);
      if (result.success) offers.push(result.data);
      else console.warn(`[sampath] Offer "${name}" failed validation:`, result.error.flatten());
    }
    if (skipped > 0) console.log(`[sampath] Skipped ${skipped} generic/junk entries`);
  } catch (err) { console.error("[sampath] Scrape failed:", err); throw err; }
  console.log(`[sampath] Scraped ${offers.length} valid offers`);
  return offers;
}
function extractPromotionList(response: SampathApiResponse): SampathPromotion[] {
  if (Array.isArray(response)) return response as SampathPromotion[];
  const obj = response as Record<string, unknown>;
  for (const key of ["data", "promotions", "result", "items", "offers"]) if (Array.isArray(obj[key])) return obj[key] as SampathPromotion[];
  for (const val of Object.values(obj)) if (Array.isArray(val) && val.length > 0) return val as SampathPromotion[];
  return [];
}
function parseTimestamp(val: number | string | undefined | null): Date | undefined {
  if (val == null || val === 0 || val === "") return undefined;
  if (typeof val === "string" && /^\d+$/.test(val.trim())) return new Date(parseInt(val, 10));
  const d = new Date(val as string | number);
  return isNaN(d.getTime()) ? undefined : d;
}
function mapPromotion(item: SampathPromotion): Partial<OfferInput> {
  const merchant = item.company_name ? cleanText(item.company_name) : "Various";
  const discountText = item.short_discount ? cleanText(item.short_discount) : undefined;
  const category = mapCategory(item.category ?? "");
  const title = discountText ? `${discountText} at ${merchant}` : merchant;
  const description = buildDescription(item);
  return { bank: "sampath_bank", bankDisplayName: "Sampath Bank", title, merchant, description, ...parseDiscount(discountText), category, merchantLogoUrl: item.image_url || undefined, validFrom: parseTimestamp(item.display_on), validUntil: parseTimestamp(item.expire_on), sourceUrl: buildDetailUrl(item.id) ?? SOURCE_URL, scrapedAt: new Date() };
}
function buildDescription(item: SampathPromotion): string | undefined {
  if (item.cards_new?.length) {
    const lines: string[] = [];
    for (const card of item.cards_new) {
      if (!card.title || !card.description) continue;
      if (/^partner$/i.test(card.title.trim())) continue;
      const value = cleanText(card.description);
      if (value) lines.push(`${card.title}: ${value}`);
    }
    if (lines.length) return lines.join(" | ").substring(0, 300);
  }
  if (item.description) { const cleaned = cleanText(item.description); if (cleaned) return cleaned.substring(0, 300); }
  return undefined;
}
function mapCategory(raw: string): OfferInput["category"] {
  const lower = raw.toLowerCase().trim().replace(/\s+/g, "_");
  if (CATEGORY_MAP[lower]) return CATEGORY_MAP[lower];
  const withoutSeparators = lower.replace(/[_\s]/g, "");
  for (const [key, val] of Object.entries(CATEGORY_MAP)) if (key.replace(/[_\s]/g, "") === withoutSeparators) return val;
  for (const [key, val] of Object.entries(CATEGORY_MAP)) if (lower.includes(key.replace(/[_\s]/g, ""))) return val;
  return detectCategoryFromText(raw);
}
function detectCategoryFromText(text: string): OfferInput["category"] {
  const lower = text.toLowerCase();
  if (/dining|restaurant|food|pizza|burger|cafe/.test(lower)) return "dining";
  if (/shopping|retail|fashion|cloth|electronics|furniture/.test(lower)) return "shopping";
  if (/travel|hotel|flight|airline|leisure/.test(lower)) return "travel";
  if (/fuel|petrol/.test(lower)) return "fuel";
  if (/grocery|supermarket/.test(lower)) return "groceries";
  if (/cinema|entertainment|movie/.test(lower)) return "entertainment";
  if (/hospital|pharmacy|health|medical|insurance/.test(lower)) return "healthcare";
  if (/online|e.commerce/.test(lower)) return "online";
  return "other";
}
function cleanText(text: string): string {
  return text.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#\d+;/g, "").replace(/\s+/g, " ").trim();
}
