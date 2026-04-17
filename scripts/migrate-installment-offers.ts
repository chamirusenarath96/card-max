/**
 * Migration: re-classify legacy offers stored as
 *   offerType: "percentage", discountPercentage: 0
 * to
 *   offerType: "installment"
 *
 * Background: Before the generalised installment regex landed in parseDiscount.ts,
 * offers like "Up to 06 months 0% installments" were stored as percentage offers
 * with discountPercentage=0 because the old regex only caught "0% interest" and
 * missed the "N months 0% installments" phrasing.
 *
 * ── Idempotency guarantee ────────────────────────────────────────────────────
 * Safety comes from the DATA FILTER, not from the migrations collection record.
 * The filter { offerType: "percentage", discountPercentage: 0 } only matches
 * records that have NOT been migrated yet. Once all records are updated to
 * offerType: "installment", the filter matches 0 documents and updateMany
 * is a no-op — no changes are made to the DB.
 *
 * This means even if the migrations collection record is accidentally deleted,
 * re-running this script is completely safe: it finds nothing to update and
 * exits cleanly without touching any data.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Usage:
 *   npx tsx scripts/migrate-installment-offers.ts
 *
 * Requires MONGODB_URI in .env.local or the environment.
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { connectDb, disconnectDb } from "../crawler/utils/db";
import { OfferModel } from "../src/lib/models/offer.model";

async function main(): Promise<void> {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error("[migrate] MONGODB_URI is required");
    process.exit(1);
  }

  await connectDb(mongoUri);

  // ── 1. Dry-run count ──────────────────────────────────────────────────────
  const matchFilter = { offerType: "percentage", discountPercentage: 0 };
  const totalMatched = await OfferModel.countDocuments(matchFilter);

  if (totalMatched === 0) {
    console.log("[migrate] No legacy percentage/0% records found — nothing to do.");
    await disconnectDb();
    return;
  }

  console.log(`[migrate] Found ${totalMatched} record(s) with offerType="percentage" and discountPercentage=0`);

  // ── 2. Sample a few for manual review ────────────────────────────────────
  const samples = await OfferModel.find(matchFilter).limit(5).select("bank merchant title discountLabel").lean();
  console.log("[migrate] Sample records to be updated:");
  samples.forEach((s, i) => {
    console.log(`  ${i + 1}. [${s.bank}] ${s.merchant} — "${s.title}" (label: "${s.discountLabel ?? ""}")`);
  });

  // ── 3. Perform the update ─────────────────────────────────────────────────
  const result = await OfferModel.updateMany(matchFilter, {
    $set: { offerType: "installment" },
  });

  console.log(`[migrate] ✅ Updated ${result.modifiedCount} / ${totalMatched} record(s) → offerType="installment"`);

  await disconnectDb();
}

main().catch((err) => {
  console.error("[migrate] Fatal error:", err);
  process.exit(1);
});
