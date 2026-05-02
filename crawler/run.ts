/**
 * Crawler entrypoint — run by GitHub Actions daily cron
 * Spec: specs/features/002-crawler.md
 *
 * Usage: npx tsx crawler/run.ts
 */
import dotenv from "dotenv";
// Load .env.local first (Next.js convention for local secrets), fall back to .env
dotenv.config({ path: ".env.local" });
dotenv.config();
import { connectDb, disconnectDb, upsertOffers, expireStaleOffers } from "./utils/db";
import * as combank from "./scrapers/combank";
import * as sampath from "./scrapers/sampath";
import * as hnb from "./scrapers/hnb";
import * as ntb from "./scrapers/ntb";
import * as amex from "./scrapers/amex";
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
  { name: "boc", module: boc },
];

interface RunSummary {
  bank: string;
  status: "success" | "error";
  scraped?: number;
  inserted?: number;
  updated?: number;
  expired?: number;
  error?: string;
  durationMs?: number;
}

async function main(): Promise<void> {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error("[crawler] MONGODB_URI environment variable is required");
    process.exit(1);
  }

  await connectDb(mongoUri);

  const summaries: RunSummary[] = [];
  let hasError = false;

  // Run all scrapers in parallel — results are collected via summaries.push()
  await Promise.allSettled(
    SCRAPERS.map(async ({ name, module }) => {
      const start = Date.now();
      try {
        const offers = await module.scrape();
        const { inserted, updated } = await upsertOffers(offers);
        const expired = await expireStaleOffers(name, offers);
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
