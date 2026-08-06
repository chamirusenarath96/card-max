/**
 * WebScrapingAPI scraping-proxy provider
 * Spec: specs/features/053-scraping-proxy-fallback.md (AC12)
 */
import type { ProxyProvider } from "./types";

export function createWebScrapingApiProvider(apiKey: string): ProxyProvider {
  return {
    name: "webscrapingapi",
    async fetchHtml(url: string): Promise<string> {
      const endpoint = `https://api.webscrapingapi.com/v2?api_key=${apiKey}&url=${encodeURIComponent(url)}`;
      const response = await fetch(endpoint);
      if (!response.ok) {
        throw new Error(`WebScrapingAPI HTTP ${response.status} fetching ${url}`);
      }
      return response.text();
    },
  };
}
