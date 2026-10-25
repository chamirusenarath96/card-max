/**
 * Bright Data Web Unlocker provider — handles anti-bot detection, CAPTCHAs,
 * and TLS/browser fingerprinting for us, locked to Sri Lanka exit nodes.
 * Spec: specs/features/078-brightdata-web-unlocker.md (AC1-AC6)
 */
import type { ProxyProvider } from "./types";

const BRIGHTDATA_REQUEST_URL = "https://api.brightdata.com/request";
const GEO_CHECK_URL = "https://geo.brdtest.com/mygeo.json";
const GEO_CHECK_INTERVAL = 50;
export const EXPECTED_COUNTRY = "lk";

// Module-level so the count persists across the lifetime of one crawler
// process even though createBrightDataUnlockerProvider() is called fresh on
// every fetchHtmlWithProxyFallback() invocation (see proxyFetch.ts).
let requestCount = 0;

interface MyGeoResponse {
  country?: string;
}

/**
 * Fetches https://geo.brdtest.com/mygeo.json *through* the Web Unlocker zone
 * and returns the exit country it reports (lowercased). Throws on a non-2xx
 * response or a non-JSON body, since either means the zone/key itself is
 * misconfigured and we can't trust any result from it.
 */
export async function verifyExitCountry(apiKey: string, zone: string): Promise<string> {
  const response = await fetch(BRIGHTDATA_REQUEST_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ zone, url: GEO_CHECK_URL, format: "raw", country: EXPECTED_COUNTRY }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Bright Data geo-check HTTP ${response.status}${body ? `: ${body.slice(0, 300)}` : ""}`);
  }

  const text = await response.text();
  let parsed: MyGeoResponse;
  try {
    parsed = JSON.parse(text) as MyGeoResponse;
  } catch {
    throw new Error(`Bright Data geo-check returned a non-JSON response: ${text.slice(0, 200)}`);
  }

  return (parsed.country ?? "").toLowerCase();
}

export function createBrightDataUnlockerProvider(apiKey: string, zone: string): ProxyProvider {
  return {
    name: "brightdata-unlocker",
    async fetchHtml(url: string, _bank?: string): Promise<string> {
      // AC2: verify on the very first request and every GEO_CHECK_INTERVAL
      // requests after that — never skip the check just because a previous
      // call in this process already passed it.
      if (requestCount % GEO_CHECK_INTERVAL === 0) {
        const country = await verifyExitCountry(apiKey, zone);
        if (country !== EXPECTED_COUNTRY) {
          throw new Error(
            `Bright Data exit country check failed: expected "${EXPECTED_COUNTRY}", got "${country || "unknown"}" — refusing to scrape through a non-Sri-Lanka exit node`
          );
        }
      }
      requestCount++;

      const response = await fetch(BRIGHTDATA_REQUEST_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ zone, url, format: "raw", country: EXPECTED_COUNTRY }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(
          `Bright Data Web Unlocker HTTP ${response.status} fetching ${url}${body ? `: ${body.slice(0, 300)}` : ""}`
        );
      }

      return response.text();
    },
  };
}

/** Exported for testing only — resets the module-level geo-check counter. */
export function _resetGeoCheckCounter(): void {
  requestCount = 0;
}
