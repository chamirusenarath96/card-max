/**
 * Cloudflare Workers scraping-proxy provider (PoC — GH-orchestrated model)
 * Spec: specs/features/072-cloudflare-workers-scraping.md (AC1, AC2)
 *
 * Calls a deployed Worker's `POST /scrape` endpoint (see `workers/scraper.js`),
 * which fetches the target URL from Cloudflare's edge (rotating egress IP
 * across colos) instead of the GH Actions runner's single IP.
 */
import type { ProxyProvider } from "./types";

function shouldRender(bank?: string): boolean {
  if (!bank) return false;
  // Sampath's API is JS-rendered SPA data (RESP001) — needs Browser Rendering.
  // Mirrors zenrows.ts's shouldUseJsRender default for the pilot bank set.
  return bank === "sampath_bank";
}

export function createWorkersProvider(workerUrl: string, workerSecret?: string): ProxyProvider {
  return {
    name: "workers",
    async fetchHtml(url: string, bank?: string): Promise<string> {
      const response = await fetch(workerUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(workerSecret ? { Authorization: `Bearer ${workerSecret}` } : {}),
        },
        body: JSON.stringify({ url, render: shouldRender(bank), bank }),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`Workers HTTP ${response.status} fetching ${url}${body ? `: ${body.slice(0, 300)}` : ""}`);
      }
      const data = (await response.json()) as { html?: string; error?: string };
      if (typeof data.html !== "string") {
        throw new Error(`Workers response missing html field fetching ${url}${data.error ? `: ${data.error}` : ""}`);
      }
      return data.html;
    },
  };
}

// Exported for testing
export function _shouldRender(bank?: string): boolean {
  return shouldRender(bank);
}
