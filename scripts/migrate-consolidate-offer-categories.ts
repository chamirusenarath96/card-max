/**
 * Migration: consolidate redundant offer categories (spec 048, issue #83)
 *
 * Changes:
 *   category: "lodging"  → "travel"    (lodging is a subset of travel spending)
 *   category: "clothing" → "shopping"  (clothing/apparel retail is a subset of general shopping)
 *
 * See README's "Category Consolidation" section for the full audit and the
 * categories that were considered but NOT merged (wellness stays distinct
 * from healthcare; installments is flagged but untouched).
 *
 * ── Idempotency guarantee ──────────────────────────────────────────────────
 * Safety comes from the DATA FILTER, not from the migrations collection record.
 * Each filter only matches documents still holding the OLD (pre-migration)
 * category value. Once migrated, those documents no longer match → updateMany
 * is a no-op.
 *
 * This means: even if the migrations collection record is accidentally deleted
 * and this script is re-run, it makes ZERO changes to the database.
 * ──────────────────────────────────────────────────────────────────────────
 *
 * Usage: npx tsx scripts/migrate-consolidate-offer-categories.ts
 *
 * Requires MONGODB_URI in .env.local or the environment.
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { fileURLToPath } from "url";
import { connectDb, disconnectDb } from "../crawler/utils/db";
import { OfferModel } from "../src/lib/models/offer.model";

const MAPPINGS: Array<{ from: string; to: string }> = [
  { from: "lodging", to: "travel" },
  { from: "clothing", to: "shopping" },
];

export async function main(): Promise<void> {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error("[migrate] MONGODB_URI is required");
    process.exit(1);
  }

  await connectDb(mongoUri);

  let grandTotal = 0;

  for (const { from, to } of MAPPINGS) {
    const filter = { category: from };
    const total = await OfferModel.countDocuments(filter);

    if (total === 0) {
      console.log(`[migrate] category="${from}" → "${to}": 0 records match — already applied or nothing to do.`);
      continue;
    }

    console.log(`[migrate] category="${from}" → "${to}": ${total} record(s) to update`);

    const samples = await OfferModel.find(filter).limit(5).select("bank merchant title").lean();
    samples.forEach((s, i) => console.log(`  ${i + 1}. [${s.bank}] ${s.merchant} — "${s.title}"`));

    const result = await OfferModel.updateMany(filter, { $set: { category: to } });
    console.log(`[migrate] ✅ Updated ${result.modifiedCount} / ${total} record(s) → category="${to}"`);
    grandTotal += result.modifiedCount;
  }

  console.log(`[migrate] Done. ${grandTotal} record(s) updated in total.`);

  await disconnectDb();
}

// Only auto-run when executed directly (`tsx scripts/migrate-*.ts`), not when
// imported — lets scripts/migrate-consolidate-offer-categories.test.ts import
// and call `main()` itself without a duplicate run.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("[migrate] Fatal error:", err);
    process.exit(1);
  });
}
