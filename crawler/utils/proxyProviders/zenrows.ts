/**
 * ZenRows scraping-proxy provider
 * Spec: specs/features/053-scraping-proxy-fallback.md (AC11),
 *       specs/features/060-fix-zenrows-boc-provider-errors.md (AC1, AC2)
 */
import type { ProxyProvider } from "./types";

export function createZenRowsProvider(apiKey: string): ProxyProvider {
  return {
    name: "zenrows",
    async fetchHtml(url: string): Promise<string> {
      const premiumProxy = process.env.ZENROWS_PREMIUM_PROXY === "true";
      const endpoint = `https://api.zenrows.com/v1/?apikey=${apiKey}&url=${encodeURIComponent(url)}${premiumProxy ? "&premium_proxy=true" : ""}`;
      const response = await fetch(endpoint);
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`ZenRows HTTP ${response.status} fetching ${url}${body ? `: ${body.slice(0, 300)}` : ""}`);
      }
      return response.text();
    },
  };
}
