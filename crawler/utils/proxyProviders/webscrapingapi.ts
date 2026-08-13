/**
 * WebScrapingAPI scraping-proxy provider
 * Spec: specs/features/053-scraping-proxy-fallback.md (AC12),
 *       specs/features/060-fix-zenrows-boc-provider-errors.md (AC2)
 */
import type { ProxyProvider } from "./types";

export function createWebScrapingApiProvider(apiKey: string): ProxyProvider {
  return {
    name: "webscrapingapi",
    async fetchHtml(url: string, _bank?: string): Promise<string> {
      const endpoint = `https://api.webscrapingapi.com/v2?api_key=${apiKey}&url=${encodeURIComponent(url)}`;
      const response = await fetch(endpoint);
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`WebScrapingAPI HTTP ${response.status} fetching ${url}${body ? `: ${body.slice(0, 300)}` : ""}`);
      }
      return response.text();
    },
  };
}
