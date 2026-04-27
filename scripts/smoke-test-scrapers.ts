/**
 * Live smoke test — runs scrapers against real sites, verifies > 0 offers returned.
 * NOT run in CI (requires real network + Playwright).
 * Run with: npm run smoke:scrapers
 *
 * Exit code: 0 if all scrapers return >= 1 offer, 1 if any return 0.
 */
import * as ntb from "../crawler/scrapers/ntb";
import * as amex from "../crawler/scrapers/amex";
import type { OfferInput } from "../specs/data/offer.schema";

interface SmokeResult {
  name: string;
  count: number;
  firstOffer: OfferInput | null;
  passed: boolean;
  durationMs: number;
  error?: string;
}

async function runScraper(
  name: string,
  scraper: { scrape: () => Promise<OfferInput[]> }
): Promise<SmokeResult> {
  const start = Date.now();
  try {
    const offers = await scraper.scrape();
    const durationMs = Date.now() - start;
    return {
      name,
      count: offers.length,
      firstOffer: offers[0] ?? null,
      passed: offers.length > 0,
      durationMs,
    };
  } catch (err) {
    const durationMs = Date.now() - start;
    return {
      name,
      count: 0,
      firstOffer: null,
      passed: false,
      durationMs,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function main(): Promise<void> {
  console.log("=".repeat(60));
  console.log("  Scraper Smoke Test — Live network required");
  console.log("=".repeat(60));
  console.log();

  const scrapers: Array<{ name: string; module: typeof ntb }> = [
    { name: "nations_trust_bank (ntb)", module: ntb },
    { name: "amex_ntb", module: amex },
  ];

  const results: SmokeResult[] = [];

  for (const { name, module } of scrapers) {
    console.log(`\n--- Running: ${name} ---`);
    const result = await runScraper(name, module);
    results.push(result);

    const status = result.passed ? "PASS" : "FAIL";
    console.log(`  Status  : ${status}`);
    console.log(`  Count   : ${result.count} offers`);
    console.log(`  Duration: ${result.durationMs}ms`);

    if (result.error) {
      console.log(`  Error   : ${result.error}`);
    }

    if (result.firstOffer) {
      console.log("  First offer:");
      console.log(JSON.stringify(result.firstOffer, null, 4));
    }
  }

  // Summary table
  console.log("\n" + "=".repeat(60));
  console.log("  Summary");
  console.log("=".repeat(60));
  console.log(
    `  ${"Scraper".padEnd(35)} ${"Count".padStart(6)}  ${"Duration".padStart(10)}  Status`
  );
  console.log("  " + "-".repeat(58));
  for (const r of results) {
    const status = r.passed ? "PASS" : "FAIL";
    console.log(
      `  ${r.name.padEnd(35)} ${String(r.count).padStart(6)}  ${(r.durationMs + "ms").padStart(10)}  ${status}`
    );
  }
  console.log();

  const allPassed = results.every((r) => r.passed);
  if (allPassed) {
    console.log("  All scrapers returned >= 1 offer. Smoke test PASSED.");
    process.exit(0);
  } else {
    const failed = results.filter((r) => !r.passed).map((r) => r.name);
    console.error(`  FAILED scrapers: ${failed.join(", ")}`);
    console.error("  Smoke test FAILED — one or more scrapers returned 0 offers.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[smoke] Fatal error:", err);
  process.exit(1);
});
