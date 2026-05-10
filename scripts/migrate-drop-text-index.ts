/**
 * Migration: drop the legacy $text index from the offers collection.
 *
 * After Atlas Search (spec 013) is deployed, the old $text index on
 * { title, description, merchant } is no longer used and should be removed
 * to avoid dead indexes consuming M0 quota.
 *
 * ── Idempotency guarantee ──────────────────────────────────────────────────
 * Discovers the text index by inspecting listIndexes() rather than hardcoding
 * the index name. If no text index is found (already dropped or never existed
 * on this environment), the script exits 0 cleanly — no changes made.
 * ──────────────────────────────────────────────────────────────────────────
 *
 * Usage: npx tsx scripts/migrate-drop-text-index.ts
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

  // Discover the text index by inspecting the index metadata
  const indexes = await OfferModel.collection.listIndexes().toArray();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const textIndex = indexes.find((idx: any) => idx.textIndexVersion !== undefined);

  if (!textIndex) {
    console.log("[migrate] No $text index found — already removed or never existed.");
    await disconnectDb();
    return;
  }

  const indexName: string = textIndex.name as string;
  console.log(`[migrate] Found $text index: "${indexName}" — dropping`);

  await OfferModel.collection.dropIndex(indexName);
  console.log(`[migrate] ✅ Dropped $text index "${indexName}"`);

  await disconnectDb();
}

main().catch((err) => {
  console.error("[migrate] Fatal error:", err);
  process.exit(1);
});
