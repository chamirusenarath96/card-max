/**
 * Migration: strip trailing "See more"/"Read more"/"View more" UI-chrome
 * fragments from already-stored People's Bank offers (spec 050, issue #90).
 *
 * Background: crawler/scrapers/peoples_bank.ts concatenates paragraph/span text
 * scraped from the bank's pages into `description` (and text derived from the
 * same paragraphs). The source pages embed a "See more" toggle as plain text
 * inside that same content, which the scraper didn't filter out before this fix
 * landed (see stripUiChrome() in that file). This migration re-applies the
 * exact same stripping logic to offers already in MongoDB, since the daily
 * crawler only touches offers it re-scrapes and won't retroactively clean
 * offers that aren't re-scraped (e.g. expired ones).
 *
 * ── Idempotency guarantee ──────────────────────────────────────────────────
 * Safety comes from the DATA FILTER, not from the migrations collection record.
 * The filter only matches peoples_bank offers whose description or
 * discountLabel still ends with a trailing chrome fragment (TRAILING_UI_CHROME_RE).
 * Once a document is updated, its fields no longer match that pattern → it drops
 * out of the filter on any re-run.
 *
 * This means: even if the migrations collection record is accidentally deleted
 * and this script is re-run, it makes ZERO further changes to already-cleaned
 * documents.
 * ──────────────────────────────────────────────────────────────────────────
 *
 * Usage: npx tsx scripts/migrate-strip-peoples-bank-see-more.ts
 *
 * Requires MONGODB_URI in .env.local or the environment.
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { fileURLToPath } from "url";
import { connectDb, disconnectDb } from "../crawler/utils/db";
import { OfferModel } from "../src/lib/models/offer.model";
import { stripUiChrome, TRAILING_UI_CHROME_RE } from "../crawler/scrapers/peoples_bank";

export async function main(): Promise<void> {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error("[migrate] MONGODB_URI is required");
    process.exit(1);
  }

  await connectDb(mongoUri);

  // Filter MUST match only documents in the pre-migration state — offers whose
  // description or discountLabel still ends with a chrome fragment.
  const filter = {
    bank: "peoples_bank",
    $or: [
      { description: { $regex: TRAILING_UI_CHROME_RE } },
      { discountLabel: { $regex: TRAILING_UI_CHROME_RE } },
    ],
  };

  const total = await OfferModel.countDocuments(filter);
  if (total === 0) {
    console.log("[migrate] 0 records match — already applied or nothing to do.");
    await disconnectDb();
    return;
  }
  console.log(`[migrate] ${total} record(s) to update`);

  const docs = await OfferModel.find(filter).select("bank merchant title description discountLabel").lean();
  docs.slice(0, 5).forEach((d, i) => {
    console.log(`  ${i + 1}. [${d.bank}] ${d.merchant} — "${d.title}"`);
  });

  const operations = docs
    .map((d) => {
      const update: Record<string, string> = {};
      if (d.description && TRAILING_UI_CHROME_RE.test(d.description)) {
        update.description = stripUiChrome(d.description);
      }
      if (d.discountLabel && TRAILING_UI_CHROME_RE.test(d.discountLabel)) {
        update.discountLabel = stripUiChrome(d.discountLabel);
      }
      return Object.keys(update).length > 0
        ? { updateOne: { filter: { _id: d._id }, update: { $set: update } } }
        : null;
    })
    .filter((op): op is NonNullable<typeof op> => op !== null);

  const result = await OfferModel.bulkWrite(operations);
  console.log(`[migrate] ✅ Updated ${result.modifiedCount} / ${total} record(s)`);

  await disconnectDb();
}

// Only auto-run when executed directly (`tsx scripts/migrate-*.ts`), not when
// imported — lets scripts/migrate-strip-peoples-bank-see-more.test.ts import
// and call `main()` itself without a duplicate run.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("[migrate] Fatal error:", err);
    process.exit(1);
  });
}
