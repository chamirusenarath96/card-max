/**
 * Provider-agnostic interface for scraping-proxy providers.
 * Spec: specs/features/053-scraping-proxy-fallback.md
 * Spec: specs/features/078-brightdata-web-unlocker.md (AC1)
 */
export interface ProxyProvider {
  name: "brightdata-unlocker" | "brightdata-residential" | "webscrapingapi";
  fetchHtml(url: string, bank?: string): Promise<string>;
}
