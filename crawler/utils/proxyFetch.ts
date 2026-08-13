/**
 * Scraping-proxy fallback wrapper for direct-fetch call sites.
 * Spec: specs/features/053-scraping-proxy-fallback.md (AC7-AC10),
 *       specs/features/060-fix-zenrows-boc-provider-errors.md (AC3-AC5),
 *       specs/features/061-boc-ntb-zenrows-js-render.md (AC1-AC5)
 */
import { getConfiguredProviders, getBankProviderMap, orderedProvidersForBank } from "./proxyProviders/registry";

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

  const providers = orderedProvidersForBank(bank, getConfiguredProviders(), getBankProviderMap());
  if (providers.length === 0) {
    throw new Error(`Direct fetch failed for ${url} and no proxy provider is configured for ${bank}`);
  }

  let lastErr: Error | undefined;
  for (const provider of providers) {
    try {
      console.log(`[proxyFetch] Retrying ${bank} via ${provider.name}: ${url}`);
      return await provider.fetchHtml(url, bank);
    } catch (err) {
      lastErr = err as Error;
      console.warn(`[proxyFetch] Provider ${provider.name} failed for ${bank} (${url}):`, lastErr.message);
    }
  }
  throw lastErr; // all configured providers failed
}
