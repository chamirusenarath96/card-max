/**
 * Scraping-proxy fallback wrapper for direct-fetch call sites.
 * Spec: specs/features/053-scraping-proxy-fallback.md (AC7-AC10)
 */
import { getConfiguredProviders, getBankProviderMap, selectProviderForBank } from "./proxyProviders/registry";

export async function fetchHtmlWithProxyFallback(
  url: string,
  bank: string,
  directFetch: () => Promise<string>
): Promise<string> {
  try {
    return await directFetch();
  } catch (err) {
    console.warn(`[proxyFetch] Direct fetch failed for ${bank} (${url}):`, (err as Error).message);
  }

  const provider = selectProviderForBank(bank, getConfiguredProviders(), getBankProviderMap());
  if (!provider) {
    throw new Error(`Direct fetch failed for ${url} and no proxy provider is configured for ${bank}`);
  }

  console.log(`[proxyFetch] Retrying ${bank} via ${provider.name}: ${url}`);
  return provider.fetchHtml(url); // rejection propagates as-is — caller's existing catch handles it
}
