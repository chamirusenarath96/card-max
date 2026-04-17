/**
 * Merchant logo / image resolution utilities.
 *
 * Resolution order (client-side fallback chain in OfferImage.tsx):
 *   1. URL already scraped from the bank page
 *   2. Clearbit Logo API  — deterministic, fast, works for known brands
 *   3. Bank name + category icon — rendered client-side, no network required
 *
 * For Sri Lankan merchants that Clearbit doesn't know about, we maintain a
 * curated domain map so Clearbit can still resolve the correct logo.
 */

// ── Curated Sri Lankan merchant domains ─────────────────────────────────────

/**
 * Maps normalised merchant name fragments → their actual website domain.
 * Keys are lowercase, spaces stripped, punctuation removed.
 * Clearbit Logo API (`logo.clearbit.com/{domain}`) uses this to resolve logos.
 */
const MERCHANT_DOMAINS: Record<string, string> = {
  // Supermarkets / Groceries
  keells:              "keells.com",
  keellssuper:         "keells.com",
  cargills:            "cargillsceylon.com",
  cargillsfoodcity:    "cargillsceylon.com",
  foodcity:            "cargillsceylon.com",
  arpico:              "arpico.lk",
  laugfs:              "laugfs.com",
  sathosa:             "coop.lk",

  // Fast food / Dining
  pizzahut:            "pizzahut.com",
  kfc:                 "kfc.com",
  mcdonalds:           "mcdonalds.com",
  burgerking:          "burgerking.com",
  dominos:             "dominos.com",
  subway:              "subway.com",
  starbucks:           "starbucks.com",
  nandos:              "nandos.com",

  // Hotels / Travel
  cinnamongrand:       "cinnamonhotels.com",
  cinnamonlakeside:    "cinnamonhotels.com",
  cinnamonbey:         "cinnamonhotels.com",
  cinnamon:            "cinnamonhotels.com",
  shangrila:           "shangri-la.com",
  hilton:              "hilton.com",
  marriott:            "marriott.com",
  taj:                 "tajhotels.com",
  jetwing:             "jetwinghotels.com",
  galadari:            "galadarihotel.com",
  kingsbury:           "thekingsburyhotel.com",

  // Airlines
  srilankanairlines:   "srilankan.com",
  srilankan:           "srilankan.com",

  // Retail / Shopping
  odel:                "odel.lk",
  softlogic:           "softlogicholdings.lk",
  singer:              "singersl.com",
  abans:               "abans.lk",
  damro:               "damro.lk",
  hameedia:            "hameedia.com",
  dialog:              "dialog.lk",
  mobitel:             "mobitel.lk",

  // Fuel
  ceypetco:            "ceypetco.gov.lk",
};

/** Normalise a merchant name to a lookup key */
function normaliseName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Derive the best Clearbit domain for a merchant */
export function resolveMerchantDomain(merchant: string): string {
  const key = normaliseName(merchant);

  // Exact match
  if (MERCHANT_DOMAINS[key]) return MERCHANT_DOMAINS[key]!;

  // Partial match (e.g. "Keells Super Nugegoda" → key starts with "keells")
  for (const [fragment, domain] of Object.entries(MERCHANT_DOMAINS)) {
    if (key.startsWith(fragment) || key.includes(fragment)) return domain;
  }

  // Fallback: guess domain from merchant name
  return guessDomain(merchant);
}

/**
 * Build a Clearbit Logo API URL for a given merchant.
 * Returns a 404 for unknowns — OfferImage.tsx catches this and advances to AI.
 */
export function buildClearbitUrl(merchant: string): string {
  const domain = resolveMerchantDomain(merchant);
  return `https://logo.clearbit.com/${domain}`;
}

// ── Scrape-time resolver ──────────────────────────────────────────────────────

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
 * Resolve the best available image URL for a merchant at scrape time.
 * Falls through: scraped URL → Clearbit.
 * If neither is reachable, returns undefined — OfferImage renders the
 * bank name + category icon fallback client-side.
 */
export async function resolveMerchantImage(
  existingUrl: string | undefined,
  merchant: string,
): Promise<string | undefined> {
  if (existingUrl && (await isReachable(existingUrl))) return existingUrl;
  if (existingUrl) console.warn(`[logo] Scraped URL unreachable: ${existingUrl}`);

  const clearbitUrl = buildClearbitUrl(merchant);
  if (await isReachable(clearbitUrl)) {
    console.log(`[logo] Clearbit logo found for ${merchant}`);
    return clearbitUrl;
  }

  console.log(`[logo] No logo found for ${merchant} — will use icon fallback`);
  return undefined;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function guessDomain(merchant: string): string {
  return (
    merchant
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, "")
      .trim()
      .replace(/\s+/g, "") + ".com"
  );
}
