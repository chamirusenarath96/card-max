/**
 * ZenRows scraping-proxy provider
 * Spec: specs/features/053-scraping-proxy-fallback.md (AC11)
 */
import type { ProxyProvider } from "./types";

export function createZenRowsProvider(apiKey: string): ProxyProvider {
  return {
    name: "zenrows",
    async fetchHtml(url: string): Promise<string> {
      const endpoint = `https://api.zenrows.com/v1/?apikey=${apiKey}&url=${encodeURIComponent(url)}&premium_proxy=true`;
      const response = await fetch(endpoint);
      if (!response.ok) {
        throw new Error(`ZenRows HTTP ${response.status} fetching ${url}`);
      }
      return response.text();
    },
  };
}
