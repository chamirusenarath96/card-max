/**
 * Provider registry + selection
 * Spec: specs/features/053-scraping-proxy-fallback.md (AC1-AC6),
 *       specs/features/060-fix-zenrows-boc-provider-errors.md (AC3)
 */
import type { ProxyProvider } from "./types";
import { createZenRowsProvider } from "./zenrows";
import { createWebScrapingApiProvider } from "./webscrapingapi";

export function getConfiguredProviders(env: NodeJS.ProcessEnv = process.env): ProxyProvider[] {
  const providers: ProxyProvider[] = [];
  if (env.ZENROWS_API_KEY) providers.push(createZenRowsProvider(env.ZENROWS_API_KEY));
  if (env.WEBSCRAPINGAPI_API_KEY) providers.push(createWebScrapingApiProvider(env.WEBSCRAPINGAPI_API_KEY));
  return providers;
}

export function getBankProviderMap(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  if (!env.PROXY_BANK_MAP) return {};
  try {
    return JSON.parse(env.PROXY_BANK_MAP);
  } catch {
    console.warn("[proxyProviders] PROXY_BANK_MAP is not valid JSON — ignoring");
    return {};
  }
}

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

  const hash = [...bank].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return providers[hash % providers.length];
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
