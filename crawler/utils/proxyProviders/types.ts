/**
 * Provider-agnostic interface for scraping-proxy providers.
 * Spec: specs/features/053-scraping-proxy-fallback.md
 */
export interface ProxyProvider {
  name: "zenrows" | "webscrapingapi";
  fetchHtml(url: string): Promise<string>;
}
