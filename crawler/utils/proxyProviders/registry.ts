/**
 * Provider registry + selection
 * Spec: specs/features/053-scraping-proxy-fallback.md (AC1-AC6),
 *       specs/features/078-brightdata-web-unlocker.md (AC11-AC13)
 */
import type { ProxyProvider } from "./types";
import { createWebScrapingApiProvider } from "./webscrapingapi";
import { createBrightDataUnlockerProvider } from "./brightDataUnlocker";
import { createBrightDataResidentialProvider } from "./brightDataResidential";

/**
 * Bright Data is the designated main fetcher (spec 078) — when either of its
 * two provider tiers is configured, WebScrapingAPI is NOT added as a further
 * fallback. This is deliberate: Bright Data's Sri-Lanka geo-lock must never
 * be silently abandoned by cascading to a different provider (and therefore
 * a different, unverified exit country) when it fails. WebScrapingAPI
 * remains available as a legacy path only for environments that haven't
 * configured Bright Data at all yet (e.g. local dev).
 */
export function getConfiguredProviders(env: NodeJS.ProcessEnv = process.env): ProxyProvider[] {
  const providers: ProxyProvider[] = [];

  if (env.BRIGHTDATA_API_KEY && env.BRIGHTDATA_ZONE) {
    providers.push(createBrightDataUnlockerProvider(env.BRIGHTDATA_API_KEY, env.BRIGHTDATA_ZONE));
  }
  if (env.BRIGHTDATA_RESIDENTIAL_CUSTOMER_ID && env.BRIGHTDATA_RESIDENTIAL_ZONE && env.BRIGHTDATA_RESIDENTIAL_PASSWORD) {
    providers.push(
      createBrightDataResidentialProvider({
        customerId: env.BRIGHTDATA_RESIDENTIAL_CUSTOMER_ID,
        zone: env.BRIGHTDATA_RESIDENTIAL_ZONE,
        password: env.BRIGHTDATA_RESIDENTIAL_PASSWORD,
      })
    );
  }

  if (providers.length > 0) return providers;

  // Legacy fallback path — only reached when no Bright Data provider is configured.
  if (env.WEBSCRAPINGAPI_API_KEY) providers.push(createWebScrapingApiProvider(env.WEBSCRAPINGAPI_API_KEY));
  return providers;
}

export function getBankProviderMap(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  if (!env.PROXY_BANK_MAP) return {};
  try {
    const raw = JSON.parse(env.PROXY_BANK_MAP) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === "string") out[k] = v;
      else if (v && typeof v === "object" && "provider" in (v as Record<string, unknown>)) {
        out[k] = String((v as Record<string, unknown>)["provider"]);
      }
    }
    return out;
  } catch {
    console.warn("[proxyProviders] PROXY_BANK_MAP is not valid JSON — ignoring");
    return {};
  }
}

const LEGACY_PROVIDER_NAMES = new Set(["webscrapingapi"]);

/** Deterministic (no shared mutable state) so the same bank always maps to the
 *  same provider within — and across — a run, without needing round-robin counters. */
export function selectProviderForBank(
  bank: string,
  providers: ProxyProvider[],
  bankMap: Record<string, string> = {}
): ProxyProvider | null {
  if (providers.length === 0) return null;

  const explicit = bankMap[bank];
  const explicitMatch = explicit && providers.find((p) => p.name === explicit);
  if (explicitMatch) return explicitMatch;

  // Legacy WebScrapingAPI-only configuration (spec 053).
  if (providers.every((p) => LEGACY_PROVIDER_NAMES.has(p.name))) {
    const hash = [...bank].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    return providers[hash % providers.length];
  }

  // Priority order otherwise (spec 078): Bright Data Web Unlocker is the main
  // fetcher for every bank by default — the first configured provider wins
  // unless a bank is explicitly pinned via PROXY_BANK_MAP (e.g. to Residential
  // for an "easy" site that doesn't need full anti-bot handling).
  return providers[0]!;
}

/** The bank's deterministically selected provider first, followed by any other
 *  configured providers — so a caller can retry via a second provider when the
 *  first one's fetchHtml() throws, instead of giving up immediately. */
export function orderedProvidersForBank(
  bank: string,
  providers: ProxyProvider[],
  bankMap: Record<string, string> = {}
): ProxyProvider[] {
  const first = selectProviderForBank(bank, providers, bankMap);
  if (!first) return [];
  return [first, ...providers.filter((p) => p !== first)];
}
