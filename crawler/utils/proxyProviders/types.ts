/**
 * Provider-agnostic interface for scraping-proxy providers.
 * Spec: specs/features/053-scraping-proxy-fallback.md
 * Spec: specs/features/061-boc-ntb-zenrows-js-render.md (AC1-AC2)
 * Spec: specs/features/072-cloudflare-workers-scraping.md (AC1)
 */
export interface ProxyProvider {
  name: "zenrows" | "webscrapingapi" | "workers";
  fetchHtml(url: string, bank?: string): Promise<string>;
}
