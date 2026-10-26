#!/usr/bin/env tsx
/**
 * Live verification: run every bank's real scraper with Bright Data
 * (Web Unlocker / Residential) as the configured proxy provider, and report
 * per-bank offer counts. This is the "test whether the existing banks run
 * successfully with this new service provider" check spec 078 calls for
 * before merging/flipping Bright Data on in production.
 *
 * Requires real credentials — set BRIGHTDATA_API_KEY + BRIGHTDATA_ZONE (and
 * optionally the BRIGHTDATA_RESIDENTIAL_* vars) in the environment before
 * running. Does NOT write to MongoDB — it only calls each scraper's scrape()
 * and prints counts, so it's safe to run against production credentials
 * without touching production data.
 *
 * Usage: npx tsx scripts/verify-brightdata.ts [--bank <name>|all]
 */
import { verifyExitCountry } from "../crawler/utils/proxyProviders/brightDataUnlocker";
import { getConfiguredProviders } from "../crawler/utils/proxyProviders/registry";

const SCRAPERS: Record<string, () => Promise<{ scrape: () => Promise<unknown[]> }>> = {
  commercial_bank: () => import("../crawler/scrapers/combank"),
  sampath_bank: () => import("../crawler/scrapers/sampath"),
  hnb: () => import("../crawler/scrapers/hnb"),
  nations_trust_bank: () => import("../crawler/scrapers/ntb"),
  amex_ntb: () => import("../crawler/scrapers/amex"),
  peoples_bank: () => import("../crawler/scrapers/peoples_bank"),
  bank_of_ceylon: () => import("../crawler/scrapers/boc"),
};

async function checkGeoLock(): Promise<boolean> {
  const apiKey = process.env.BRIGHTDATA_API_KEY;
  const zone = process.env.BRIGHTDATA_ZONE;
  if (!apiKey || !zone) {
    console.log("BRIGHTDATA_API_KEY/BRIGHTDATA_ZONE not set — skipping Web Unlocker geo-lock check");
    return false;
  }
  try {
    const country = await verifyExitCountry(apiKey, zone);
    console.log(`Web Unlocker exit country: "${country}" ${country === "lk" ? "(OK)" : "(UNEXPECTED — expected lk)"}`);
    return country === "lk";
  } catch (err) {
    console.log(`Web Unlocker geo-check FAILED: ${(err as Error).message}`);
    return false;
  }
}

async function verifyBank(bank: string): Promise<void> {
  const loader = SCRAPERS[bank];
  if (!loader) {
    console.log(`Unknown bank "${bank}"`);
    return;
  }
  console.log(`\n=== ${bank} ===`);
  const start = Date.now();
  try {
    const { scrape } = await loader();
    const offers = await scrape();
    console.log(`  scraped ${offers.length} offers in ${Date.now() - start}ms`);
  } catch (err) {
    console.log(`  FAILED after ${Date.now() - start}ms: ${(err as Error).message}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const bankFlagIdx = args.indexOf("--bank");
  const requested = bankFlagIdx >= 0 ? args[bankFlagIdx + 1] : "all";

  const providers = getConfiguredProviders();
  console.log(`Configured providers (priority order): ${providers.map((p) => p.name).join(", ") || "(none)"}`);
  if (providers.length === 0 || !providers.some((p) => p.name.startsWith("brightdata"))) {
    console.log(
      "WARNING: no Bright Data provider is configured — this run will test direct fetches (and the legacy " +
        "WebScrapingAPI provider if set), not Bright Data. Set BRIGHTDATA_API_KEY + BRIGHTDATA_ZONE first."
    );
  }

  await checkGeoLock();

  const banks = requested === "all" || !requested ? Object.keys(SCRAPERS) : [requested];
  for (const bank of banks) {
    await verifyBank(bank);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
