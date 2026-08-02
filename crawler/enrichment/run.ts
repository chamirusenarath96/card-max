/**
 * Offer enrichment entrypoint — run by GitHub Actions after the daily crawl.
 * Spec: specs/features/044-ai-offer-enrichment.md
 *
 * Decoupled from the crawler on purpose (Architecture Decision #1): it only
 * processes offers left `enrichmentStatus: "pending"` (new/changed offers
 * from the crawl) or `"failed"` (retries from a prior enrichment run) — never
 * a full sweep of the collection, and it never re-scrapes (AC6).
 *
 * Usage: npx tsx crawler/enrichment/run.ts
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import mongoose from "mongoose";
import { OfferModel } from "../../src/lib/models/offer.model";
import { enrichOffer, type OfferForEnrichment } from "./enrichOffer";
import { pLimit } from "../utils/http";

const CONCURRENCY = 3;

// If this many enrichment calls fail back-to-back, treat it as a provider
// outage/rate-limit rather than per-offer bad luck, and stop for this run —
// remaining offers simply stay pending/failed for the next scheduled pass
// (Edge Cases: "must degrade ... not fail the entire enrichment workflow run").
const CIRCUIT_BREAKER_THRESHOLD = 5;

export interface EnrichmentRunSummary {
  total: number;
  done: number;
  failed: number;
  haltedEarly: boolean;
}

export async function runEnrichment(): Promise<EnrichmentRunSummary> {
  const offers = await OfferModel.find({
    enrichmentStatus: { $in: ["pending", "failed"] },
  }).lean();

  let done = 0;
  let failed = 0;
  let consecutiveFailures = 0;
  let haltedEarly = false;

  const tasks = offers.map((doc) => async () => {
    if (haltedEarly) return;

    const offer: OfferForEnrichment = {
      title: doc.title,
      description: doc.description,
      merchant: doc.merchant,
      category: doc.category,
      sourceUrl: doc.sourceUrl,
      validFrom: doc.validFrom,
      validUntil: doc.validUntil,
    };

    const patch = await enrichOffer(offer);
    await OfferModel.updateOne({ _id: doc._id }, { $set: patch });

    if (patch.enrichmentStatus === "done") {
      done++;
      consecutiveFailures = 0;
    } else {
      failed++;
      consecutiveFailures++;
      if (consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD && !haltedEarly) {
        haltedEarly = true;
        console.warn(
          `[enrichment] ${CIRCUIT_BREAKER_THRESHOLD} consecutive failures — halting this run early; ` +
            "remaining offers stay pending/failed for a later retry."
        );
      }
    }
  });

  await pLimit(tasks, CONCURRENCY);

  return { total: offers.length, done, failed, haltedEarly };
}

async function main(): Promise<void> {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error("[enrichment] MONGODB_URI environment variable is required");
    process.exit(1);
    return;
  }
  if (!process.env.GEMINI_API_KEY) {
    console.error("[enrichment] GEMINI_API_KEY environment variable is required");
    process.exit(1);
    return;
  }

  await mongoose.connect(mongoUri, { dbName: "card-max" });

  const summary = await runEnrichment();

  await mongoose.disconnect();

  console.log(
    JSON.stringify({ timestamp: new Date().toISOString(), ...summary }, null, 2)
  );

  // Per-offer enrichment failures are expected/retryable and must never fail
  // this workflow (it is decoupled from the crawler) — only a fatal setup
  // error above (missing env vars, DB connect failure) exits non-zero.
  process.exit(0);
}

main().catch((err) => {
  console.error("[enrichment] Fatal error:", err);
  process.exit(1);
});
