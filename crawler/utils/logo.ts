/**
 * Merchant logo / image resolution utilities.
 *
 * Resolution order:
 *   1. Use the URL already scraped from the bank page (if any)
 *   2. Try Clearbit Logo API — works well for globally-known brands
 *   3. Generate an AI image via Pollinations.ai — always succeeds, based on
 *      the offer's title + merchant + category description
 *
 * Pollinations.ai is free with no API key and produces a stable URL from the
 * same prompt, so the generated image is deterministic for a given offer.
 */

/** Category → human-readable scene description for the AI prompt */
const CATEGORY_SCENE: Record<string, string> = {
  dining:        "restaurant meal food",
  shopping:      "retail shopping store",
  travel:        "travel vacation hotel",
  fuel:          "petrol fuel station",
  groceries:     "supermarket groceries",
  entertainment: "entertainment cinema concert",
  health:        "health wellness pharmacy",
  online:        "online shopping ecommerce",
  other:         "promotional offer deal",
};

/**
 * Turns a merchant name into a best-effort domain guess for Clearbit.
 * e.g. "Pizza Hut"   → "pizzahut.com"
 *      "Cinnamon Grand" → "cinnamongrand.com"
 */
function guessDomain(merchant: string): string {
  return merchant
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")  // strip punctuation
    .trim()
    .replace(/\s+/g, "")         // remove spaces
    + ".com";
}

/**
 * Build a Pollinations.ai URL that generates a relevant image for the offer.
 * The URL is deterministic (same inputs → same image) so it stays stable
 * across re-scrapes. Width/height match the default card image area.
 */
export function buildPollinationsUrl(
  merchant: string,
  category: string,
): string {
  const scene = CATEGORY_SCENE[category] ?? "promotional offer";
  const prompt = encodeURIComponent(
    `${merchant} ${scene} professional marketing photo, clean background, no text`
  );
  // seed derived from merchant name for determinism
  const seed = merchant.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return `https://image.pollinations.ai/prompt/${prompt}?width=640&height=360&seed=${seed}&nologo=true`;
}

/**
 * Verify a URL is reachable with a HEAD request (returns true if HTTP 2xx).
 * Times out quickly so it doesn't slow the crawler too much.
 */
async function isReachable(url: string, timeoutMs = 3000): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { method: "HEAD", signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Resolve the best available image URL for a merchant offer.
 *
 * @param existingUrl  - URL already scraped from the bank page (may be undefined)
 * @param merchant     - Merchant name (e.g. "Pizza Hut")
 * @param category     - Offer category (e.g. "dining")
 * @param title        - Full offer title for AI prompt context
 * @returns            - A valid image URL, always falls through to Pollinations
 */
export async function resolveMerchantImage(
  existingUrl: string | undefined,
  merchant: string,
  category: string,
): Promise<string> {
  // 1. Use scraped URL if it's reachable
  if (existingUrl) {
    const ok = await isReachable(existingUrl);
    if (ok) return existingUrl;
    console.warn(`[logo] Scraped URL unreachable, trying fallbacks: ${existingUrl}`);
  }

  // 2. Try Clearbit logo (great for globally-known brands)
  const clearbitUrl = `https://logo.clearbit.com/${guessDomain(merchant)}`;
  if (await isReachable(clearbitUrl)) {
    console.log(`[logo] Clearbit logo found for ${merchant}`);
    return clearbitUrl;
  }

  // 3. Fallback: AI-generated image via Pollinations.ai (always succeeds)
  const pollinationsUrl = buildPollinationsUrl(merchant, category);
  console.log(`[logo] Using Pollinations.ai image for ${merchant}`);
  return pollinationsUrl;
}
