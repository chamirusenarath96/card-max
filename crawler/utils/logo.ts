/**
 * Merchant logo / image resolution utilities.
 *
 * Resolution order (priority chain):
 *   1. existingUrl already stored in DB — return immediately (no API calls)
 *   2. Curated MERCHANT_DOMAINS map → Clearbit URL (fast path, no HEAD verify)
 *   3. Clearbit logo for normalised merchant name → HEAD verify
 *   4. Brandfetch API (rate-limited: 40 calls/run max)
 *   5. undefined — OfferImage.tsx renders category icon fallback
 */

// ── Curated Sri Lankan merchant domains ─────────────────────────────────────

/**
 * Maps normalised merchant name fragments → their actual website domain.
 * Keys are lowercase, punctuation and spaces removed.
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
  laughfs:             "laugfs.com",
  richmondsupermarket: "richmond.lk",
  supermart:           "supermart.lk",

  // Fast food / Dining
  pizzahut:            "pizzahut.com",
  kfc:                 "kfc.com",
  mcdonalds:           "mcdonalds.com",
  burgerking:          "burgerking.com",
  dominos:             "dominos.com",
  dominospizza:        "dominos.com",
  subway:              "subway.com",
  starbucks:           "starbucks.com",
  nandos:              "nandos.com",
  milanos:             "milanospizza.lk",
  cottolengo:          "cottolengo.lk",
  ministop:            "ministop.lk",
  barrelhouse:         "barrelhouse.lk",
  thegoodmarket:       "thegoodmarket.lk",
  cafenoma:            "noma.lk",
  chilis:              "chilis.com",
  tastybite:           "tastybite.lk",
  theclub:             "theclub.lk",
  yellowfins:          "yellowfins.lk",
  sizzle:              "sizzle.lk",

  // Hotels / Travel
  cinnamongrand:       "cinnamonhotels.com",
  cinnamonlakeside:    "cinnamonhotels.com",
  cinnamonbey:         "cinnamonhotels.com",
  cinnamon:            "cinnamonhotels.com",
  cinnamonlife:        "cinnamonhotels.com",
  shangrila:           "shangri-la.com",
  hilton:              "hilton.com",
  marriott:            "marriott.com",
  taj:                 "tajhotels.com",
  jetwing:             "jetwinghotels.com",
  galadari:            "galadarihotel.com",
  kingsbury:           "thekingsburyhotel.com",
  grandhyatt:          "hyatt.com",
  hyatt:               "hyatt.com",
  movenpick:           "movenpick.com",
  clarksexotica:       "clarksexotica.com",
  heritancehotels:     "heritancehotels.com",
  amanwella:           "aman.com",
  wallawwa:            "wallawwa.com",
  earls:               "theearls.lk",

  // Airlines / Travel
  srilankanairlines:   "srilankan.com",
  srilankan:           "srilankan.com",
  fitair:              "fitair.lk",
  makemytrip:          "makemytrip.com",
  airasia:             "airasia.com",

  // Retail / Shopping
  odel:                "odel.lk",
  softlogic:           "softlogicholdings.lk",
  softlogiclifestyle:  "softlogiclifestyle.lk",
  singer:              "singersl.com",
  abans:               "abans.lk",
  damro:               "damro.lk",
  hameedia:            "hameedia.com",
  dialog:              "dialog.lk",
  mobitel:             "mobitel.lk",
  slt:                 "slt.lk",
  airtel:              "airtel.lk",
  hutch:               "hutch.lk",
  fashionbugs:         "fashionbugs.lk",
  nolimit:             "nolimit.lk",
  timzo:               "timzo.lk",
  globaltel:           "globaltel.lk",
  apple:               "apple.com",
  samsung:             "samsung.com",
  huawei:              "huawei.com",
  xiaomi:              "xiaomi.com",

  // Health / Beauty
  osu:                 "osu.lk",
  medfair:             "medfair.lk",
  medicare:            "medicare.lk",
  naturalbasics:       "naturalbasics.lk",
  bodyshop:            "thebodyshop.com",
  thebodyshop:         "thebodyshop.com",
  laksala:             "laksala.lk",
  bodyline:            "bodylinepharmacy.lk",

  // Fuel
  ceypetco:            "ceypetco.gov.lk",
  ltl:                 "ltnow.lk",

  // Entertainment / Leisure
  scope:               "scopecinemas.com",
  scopecinemas:        "scopecinemas.com",
  majestikcinemas:     "majestikcinemas.lk",
  readingcinemas:      "readingcinemas.lk",
  entertainment:       "colombo.lk",
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
 * Returns a 404 for unknowns — OfferImage.tsx catches this and renders icon fallback.
 */
export function buildClearbitUrl(merchant: string): string {
  const domain = resolveMerchantDomain(merchant);
  return `https://logo.clearbit.com/${domain}`;
}

// ── Brandfetch API ────────────────────────────────────────────────────────────

const BRANDFETCH_CALL_LIMIT = 40;

/** Module-level counter — reset to 0 at process start (i.e. per crawler run) */
let brandfetchCallCount = 0;

/** Reset the counter (exported for testing) */
export function resetBrandfetchCounter(): void {
  brandfetchCallCount = 0;
}

/** Return current call count (exported for testing) */
export function getBrandfetchCallCount(): number {
  return brandfetchCallCount;
}

interface BrandfetchFormat {
  src: string;
  width?: number;
  height?: number;
}

interface BrandfetchLogo {
  formats: BrandfetchFormat[];
}

interface BrandfetchResponse {
  logos?: BrandfetchLogo[];
}

async function resolveBrandfetch(domain: string): Promise<string | undefined> {
  const apiKey = process.env.BRANDFETCH_API_KEY;
  if (!apiKey) {
    console.warn("[logo] BRANDFETCH_API_KEY not set — skipping Brandfetch");
    return undefined;
  }

  if (brandfetchCallCount >= BRANDFETCH_CALL_LIMIT) {
    console.warn(
      `[logo] Brandfetch call limit (${BRANDFETCH_CALL_LIMIT}) reached for this run — skipping`,
    );
    return undefined;
  }

  brandfetchCallCount++;

  try {
    const res = await fetch(`https://api.brandfetch.io/v2/brands/${domain}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      console.log(`[logo] Brandfetch ${res.status} for ${domain}`);
      return undefined;
    }

    const data = (await res.json()) as BrandfetchResponse;
    const logoUrl = data.logos?.[0]?.formats?.[0]?.src;
    if (logoUrl) {
      console.log(`[logo] Brandfetch logo found for ${domain}: ${logoUrl}`);
      return logoUrl;
    }
    return undefined;
  } catch (err) {
    console.warn(`[logo] Brandfetch error for ${domain}:`, err);
    return undefined;
  }
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
 *
 * Priority chain:
 *   1. existingUrl already in DB → return immediately (AC5: no re-query)
 *   2. Clearbit logo via curated domain map or name normalisation → HEAD verify
 *   3. Brandfetch API (max 40 calls/run) → AC2, AC3, AC4
 *   4. undefined → OfferImage renders bank name + category icon fallback
 */
export async function resolveMerchantImage(
  existingUrl: string | undefined,
  merchant: string,
): Promise<string | undefined> {
  // AC5: merchant already has a logo stored — skip all external calls
  if (existingUrl) return existingUrl;

  const clearbitUrl = buildClearbitUrl(merchant);
  if (await isReachable(clearbitUrl)) {
    console.log(`[logo] Clearbit logo found for ${merchant}`);
    return clearbitUrl;
  }

  // AC2: Brandfetch as secondary fallback when Clearbit fails
  const domain = resolveMerchantDomain(merchant);
  const brandfetchUrl = await resolveBrandfetch(domain);
  if (brandfetchUrl) return brandfetchUrl;

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
