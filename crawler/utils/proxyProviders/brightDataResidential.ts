/**
 * Bright Data Residential proxy provider — cheaper than the Web Unlocker,
 * for sites that don't need full anti-bot/CAPTCHA handling. Locked to Sri
 * Lanka residential exit nodes via the proxy username's country flag.
 * Spec: specs/features/078-brightdata-web-unlocker.md (AC7-AC10)
 *
 * Caveat (documented, not fixed by this provider): a plain proxied fetch
 * does not change the Node/undici TLS fingerprint. This is only safe for
 * "easy" sites that don't fingerprint-check — anything that does should be
 * routed to the Web Unlocker provider instead, which handles that for us.
 */
import { ProxyAgent } from "undici";
import type { ProxyProvider } from "./types";
import { EXPECTED_COUNTRY } from "./brightDataUnlocker";

const PROXY_HOST = "brd.superproxy.io";
const PROXY_PORT = 33335;
const GEO_CHECK_URL = "https://geo.brdtest.com/mygeo.json";
const GEO_CHECK_INTERVAL = 50;

/** Node's global `fetch` (undici) accepts `dispatcher`, but the DOM-derived
 *  `RequestInit` type lib.dom.d.ts ships doesn't declare it. */
type FetchInitWithDispatcher = RequestInit & { dispatcher: ProxyAgent };

let requestCount = 0;

export interface BrightDataResidentialConfig {
  customerId: string;
  zone: string;
  password: string;
}

function buildUsername(config: BrightDataResidentialConfig, session: string): string {
  return `brd-customer-${config.customerId}-zone-${config.zone}-country-${EXPECTED_COUNTRY}-session-${session}`;
}

function buildProxyAgent(config: BrightDataResidentialConfig, session: string): ProxyAgent {
  const username = buildUsername(config, session);
  return new ProxyAgent({
    uri: `https://${PROXY_HOST}:${PROXY_PORT}`,
    token: `Basic ${Buffer.from(`${username}:${config.password}`).toString("base64")}`,
  });
}

interface MyGeoResponse {
  country?: string;
}

/** Verifies a given sticky session's exit country before trusting it. */
export async function verifyResidentialSession(
  config: BrightDataResidentialConfig,
  session: string
): Promise<string> {
  const dispatcher = buildProxyAgent(config, session);
  try {
    const response = await fetch(GEO_CHECK_URL, { dispatcher } as FetchInitWithDispatcher);
    if (!response.ok) {
      throw new Error(`Bright Data residential geo-check HTTP ${response.status}`);
    }
    const text = await response.text();
    const parsed = JSON.parse(text) as MyGeoResponse;
    return (parsed.country ?? "").toLowerCase();
  } finally {
    await dispatcher.close();
  }
}

export function createBrightDataResidentialProvider(config: BrightDataResidentialConfig): ProxyProvider {
  // One sticky session per provider instance so repeated fetchHtml() calls
  // within a single scrape reuse the same residential IP rather than
  // rotating on every request.
  const session = `cardmax-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  return {
    name: "brightdata-residential",
    async fetchHtml(url: string, _bank?: string): Promise<string> {
      if (requestCount % GEO_CHECK_INTERVAL === 0) {
        const country = await verifyResidentialSession(config, session);
        if (country !== EXPECTED_COUNTRY) {
          throw new Error(
            `Bright Data residential exit country check failed: expected "${EXPECTED_COUNTRY}", got "${country || "unknown"}" — refusing to scrape through a non-Sri-Lanka exit node`
          );
        }
      }
      requestCount++;

      const dispatcher = buildProxyAgent(config, session);
      try {
        const response = await fetch(url, { dispatcher } as FetchInitWithDispatcher);
        if (!response.ok) {
          throw new Error(`Bright Data residential HTTP ${response.status} fetching ${url}`);
        }
        return await response.text();
      } finally {
        await dispatcher.close();
      }
    },
  };
}

/** Exported for testing only — resets the module-level geo-check counter. */
export function _resetGeoCheckCounter(): void {
  requestCount = 0;
}
