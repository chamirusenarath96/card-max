#!/usr/bin/env tsx
/**
 * Verify ZenRows (and fallback) per bank — for issues 141-143
 * Usage: npx tsx scripts/verify-zenrows.ts --bank sampath_bank|nations_trust_bank|bank_of_ceylon|all
 */
import { createZenRowsProvider } from "../crawler/utils/proxyProviders/zenrows";
import { createWebScrapingApiProvider } from "../crawler/utils/proxyProviders/webscrapingapi";

const BANK_URLS: Record<string, string[]> = {
  sampath_bank: ["https://www.sampath.lk/api/card-promotions?page_number=1&size=200"],
  nations_trust_bank: ["https://www.nationstrust.com/promotions/what-s-new"],
  bank_of_ceylon: [
    "https://www.boc.lk/personal-banking/card-offers/online",
    "https://www.boc.lk/personal-banking/card-offers/visa-offers",
    "https://www.boc.lk/personal-banking/card-offers/fashion-lifestyle",
  ],
};

async function verifyBank(bank: string, urls: string[]) {
  console.log(`\n=== ${bank} ===`);
  const zenrowsKey = process.env.ZENROWS_API_KEY;
  const wsaKey = process.env.WEBSCRAPINGAPI_API_KEY;
  const providers: Array<{ name: string; fetchHtml: (url: string, bank?: string) => Promise<string> }> = [];
  if (zenrowsKey) providers.push(createZenRowsProvider(zenrowsKey));
  else console.log("ZENROWS_API_KEY not set — skipping ZenRows");
  if (wsaKey) providers.push(createWebScrapingApiProvider(wsaKey));
  else console.log("WEBSCRAPINGAPI_API_KEY not set — skipping WSA");
  if (providers.length === 0) {
    console.log("No providers configured");
    return;
  }
  for (const url of urls) {
    console.log(`\nURL: ${url}`);
    for (const p of providers) {
      try {
        const start = Date.now();
        const html = await p.fetchHtml(url, bank);
        const ms = Date.now() - start;
        const snippet = html.slice(0, 500).replace(/\s+/g, " ");
        const isBlocked = html.includes("Incapsula incident ID") || html.includes("REQS001") || html.length < 500;
        console.log(`  ${p.name}: OK ${html.length} chars in ${ms}ms${isBlocked ? " — POSSIBLY BLOCKED" : ""}`);
        console.log(`    snippet: ${snippet.slice(0, 200)}`);
        if (bank === "sampath_bank") {
          try {
            const j = JSON.parse(html);
            const count = Array.isArray(j) ? j.length : Array.isArray((j as unknown as {data: unknown[]}).data) ? (j as unknown as {data: unknown[]}).data.length : Object.keys(j).length;
            console.log(`    JSON parsed, top-level count/keys: ${count}`);
          } catch {
            console.log(`    not JSON, HTML length ${html.length}`);
          }
        }
        break; // success — don't try next provider
      } catch (e) {
        console.log(`  ${p.name}: FAILED — ${(e as Error).message.slice(0, 400)}`);
      }
    }
  }
}

async function main() {
  // arg parsed via bankArg below
  const bankArg = (process.argv.find((a) => a.startsWith("--bank"))?.split("=")[1] || (process.argv.includes("--bank") ? process.argv[process.argv.indexOf("--bank") + 1] : "all")).toLowerCase();
  const banks = bankArg === "all" ? Object.keys(BANK_URLS) : [bankArg];
  for (const b of banks) {
    const urls = BANK_URLS[b];
    if (!urls) {
      console.error(`Unknown bank ${b}, known: ${Object.keys(BANK_URLS).join(", ")}`);
      continue;
    }
    await verifyBank(b, urls);
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
