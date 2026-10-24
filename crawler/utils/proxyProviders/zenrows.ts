/**
 * ZenRows scraping-proxy provider
 * Spec: specs/features/053-scraping-proxy-fallback.md (AC11),
 *       specs/features/060-fix-zenrows-boc-provider-errors.md (AC1, AC2),
 *       specs/features/061-boc-ntb-zenrows-js-render.md (AC1-AC5)
 */
import type { ProxyProvider } from "./types";

function shouldUseJsRender(bank?: string): boolean {
  if (!bank) return false;
  // Explicit per-bank map via PROXY_BANK_JS_RENDER_MAP JSON, e.g. {"bank_of_ceylon":true}
  const raw = process.env.PROXY_BANK_JS_RENDER_MAP;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, boolean>;
      if (bank in parsed) return !!parsed[bank];
    } catch {
      // ignore invalid JSON
    }
  }
  // Extended PROXY_BANK_MAP object form: {"bank_of_ceylon":{"provider":"zenrows","jsRender":true}}
  const bankMapRaw = process.env.PROXY_BANK_MAP;
  if (bankMapRaw) {
    try {
      const map = JSON.parse(bankMapRaw) as Record<string, unknown>;
      const val = map[bank];
      if (val && typeof val === "object" && val !== null) {
        const obj = val as Record<string, unknown>;
        if ("jsRender" in obj) return !!obj["jsRender"];
        if ("js_render" in obj) return !!obj["js_render"];
      }
    } catch {
      // ignore
    }
  }
  // Default per spec 061: BOC and NTB require js_render, others do not
  if (bank === "bank_of_ceylon" || bank === "nations_trust_bank") return true;
  return false;
}

export function createZenRowsProvider(apiKey: string): ProxyProvider {
  return {
    name: "zenrows",
    async fetchHtml(url: string, bank?: string): Promise<string> {
      const premiumProxy = process.env.ZENROWS_PREMIUM_PROXY === "true";
      const jsRender = shouldUseJsRender(bank);
      const endpoint = `https://api.zenrows.com/v1/?apikey=${apiKey}&url=${encodeURIComponent(url)}${premiumProxy ? "&premium_proxy=true" : ""}${jsRender ? "&js_render=true" : ""}`;
      const response = await fetch(endpoint);
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`ZenRows HTTP ${response.status} fetching ${url}${body ? `: ${body.slice(0, 300)}` : ""}`);
      }
      return response.text();
    },
  };
}

// Exported for testing
export function _shouldUseJsRender(bank?: string): boolean {
  return shouldUseJsRender(bank);
}
