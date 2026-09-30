#!/usr/bin/env tsx
/**
 * Verify the Cloudflare Workers PoC provider against blocked bank URLs — spec 072 AC1/AC2
 * Usage: WORKER_SCRAPE_URL=... WORKER_SECRET=... npx tsx scripts/verify-workers.ts --bank sampath_bank|nations_trust_bank|bank_of_ceylon|all
 */
import { createWorkersProvider } from "../crawler/utils/proxyProviders/workers";

const BANK_URLS: Record<string, string[]> = {
  nations_trust_bank: ["https://www.nationstrust.com/promotions/what-s-new"],
  bank_of_ceylon: ["https://www.boc.lk/personal-banking/card-offers/dining"],
  sampath_bank: ["https://www.sampath.lk/api/card-promotions?page_number=1&size=200"],
};

async function verifyBank(bank: string, urls: string[], workerUrl: string, secret: string | undefined) {
  console.log(`\n=== ${bank} ===`);
  const provider = createWorkersProvider(workerUrl, secret);
  for (const url of urls) {
    console.log(`\nURL: ${url}`);
    try {
      const start = Date.now();
      const html = await provider.fetchHtml(url, bank);
      const ms = Date.now() - start;
      const isBlocked = html.includes("Incapsula incident ID") || html.includes("REQS001") || html.length < 500;
      console.log(`  workers: OK ${html.length} chars in ${ms}ms${isBlocked ? " — POSSIBLY BLOCKED" : ""}`);
      console.log(`    snippet: ${html.slice(0, 200).replace(/\s+/g, " ")}`);
      if (bank === "sampath_bank") {
        try {
          const parsed = JSON.parse(html) as unknown;
          const count = Array.isArray(parsed)
            ? parsed.length
            : Array.isArray((parsed as { data?: unknown[] }).data)
              ? (parsed as { data: unknown[] }).data.length
              : Object.keys(parsed as object).length;
          console.log(`    JSON parsed, top-level count/keys: ${count}`);
        } catch {
          console.log(`    not JSON, HTML length ${html.length}`);
        }
      }
    } catch (e) {
      console.log(`  workers: FAILED — ${(e as Error).message.slice(0, 400)}`);
    }
  }
}

async function main() {
  const workerUrl = process.env.WORKER_SCRAPE_URL;
  if (!workerUrl) {
    console.error("WORKER_SCRAPE_URL is required — deploy workers/scraper.js first (see workers/README.md)");
    process.exit(1);
  }
  const secret = process.env.WORKER_SECRET;

  const bankArg = (
    process.argv.find((a) => a.startsWith("--bank="))?.split("=")[1] ||
    (process.argv.includes("--bank") ? process.argv[process.argv.indexOf("--bank") + 1] : "all")
  ).toLowerCase();
  const banks = bankArg === "all" ? Object.keys(BANK_URLS) : [bankArg];

  for (const b of banks) {
    const urls = BANK_URLS[b];
    if (!urls) {
      console.error(`Unknown bank ${b}, known: ${Object.keys(BANK_URLS).join(", ")}`);
      continue;
    }
    await verifyBank(b, urls, workerUrl, secret);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
