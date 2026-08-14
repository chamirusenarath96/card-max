/**
 * Crawler entrypoint — run by GitHub Actions daily cron
 * Spec: specs/features/002-crawler.md
 *
 * Usage: npx tsx crawler/run.ts
 */
import dotenv from "dotenv";
import fs from "node:fs";
// Load .env.local first (Next.js convention for local secrets), fall back to .env
dotenv.config({ path: ".env.local" });
dotenv.config();
import { connectDb, disconnectDb, upsertOffers, expireStaleOffers, getActiveOfferCountsByBank } from "./utils/db";
import { detectFailures, reportFailures } from "./utils/failureAlerts";
import type { RunSummary } from "./utils/failureAlerts";
import * as combank from "./scrapers/combank";
import * as sampath from "./scrapers/sampath";
import * as hnb from "./scrapers/hnb";
import * as ntb from "./scrapers/ntb";
import * as amex from "./scrapers/amex";
import * as peoples_bank from "./scrapers/peoples_bank";
import * as boc from "./scrapers/boc";
import type { OfferInput } from "../specs/data/offer.schema";

interface ScraperModule {
  scrape: () => Promise<OfferInput[]>;
}

interface ScraperConfig {
  name: string;
  module: ScraperModule;
}

const SCRAPERS: ScraperConfig[] = [
  { name: "commercial_bank", module: combank },
  { name: "sampath_bank", module: sampath },
  { name: "hnb", module: hnb },
  { name: "nations_trust_bank", module: ntb },
  { name: "amex_ntb", module: amex },
  { name: "peoples_bank", module: peoples_bank },
  { name: "bank_of_ceylon", module: boc },
];

async function main(): Promise<void> {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error("[crawler] MONGODB_URI environment variable is required");
    process.exit(1);
  }

  await connectDb(mongoUri);
  const previousActiveCounts = await getActiveOfferCountsByBank();

  const summaries: RunSummary[] = [];
  let hasError = false;

  // Run all scrapers in parallel — results are collected via summaries.push()
  await Promise.allSettled(
    SCRAPERS.map(async ({ name, module }) => {
      const start = Date.now();
      try {
        const offers = await module.scrape();
        const { inserted, updated } = await upsertOffers(offers);
        let expired = 0;
        if (offers.length > 0) {
          expired = await expireStaleOffers(name, offers);
        } else {
          console.warn(`[run] Skipping expiry for ${name} — 0 offers returned`);
        }
        const durationMs = Date.now() - start;

        const summary: RunSummary = {
          bank: name,
          status: "success",
          scraped: offers.length,
          inserted,
          updated,
          expired,
          durationMs,
        };
        if (offers.length === 0 && (previousActiveCounts[name] ?? 0) > 0) {
          console.warn(`[run] ${name} scraped 0 offers but had ${previousActiveCounts[name]} active before, will be reported as zero_offers`);
        }
        summaries.push(summary);
        return summary;
      } catch (err) {
        hasError = true;
        const summary: RunSummary = {
          bank: name,
          status: "error",
          error: err instanceof Error ? err.message : String(err),
          durationMs: Date.now() - start,
        };
        summaries.push(summary);
        return summary;
      }
    })
  );

  const failures = detectFailures(summaries, previousActiveCounts);
  if (failures.length > 0) {
    await reportFailures(failures); // advisory — never throws
  }

  // Write summary file for workflow failure issue enrichment (063 AC3)
  try {
    fs.writeFileSync("./crawler-summary.json", JSON.stringify({ summaries, failures }, null, 2));
  } catch {}

  await disconnectDb();

  // Log structured summary
  console.log(
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        summaries,
        totalScraped: summaries.reduce((s, r) => s + (r.scraped ?? 0), 0),
        totalInserted: summaries.reduce((s, r) => s + (r.inserted ?? 0), 0),
        totalUpdated: summaries.reduce((s, r) => s + (r.updated ?? 0), 0),
        totalExpired: summaries.reduce((s, r) => s + (r.expired ?? 0), 0),
        errors: summaries.filter((r) => r.status === "error").length,
      },
      null,
      2
    )
  );

  // Exit with error code if any scraper failed (triggers GH Actions failure alert)
  process.exit(hasError ? 1 : 0);
}

main().catch((err) => {
  console.error("[crawler] Fatal error:", err);
  process.exit(1);
});
