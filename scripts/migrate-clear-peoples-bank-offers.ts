/**
 * Migration: delete all existing People's Bank offers
 *
 * The People's Bank scraper was using an outdated HTML structure
 * (.promotion-card) that no longer exists on the site. When that selector
 * failed it fell back to heading-based parsing, which picked up Tamil-script
 * bank staff names from hidden popup modals on every page.
 *
 * The scraper has been rewritten to target the current <article class="offer-card">
 * structure and strip popup modal content before parsing. This migration wipes the
 * stale junk offers so the next crawler run repopulates with clean data.
 *
 * ── Idempotency ──────────────────────────────────────────────────────────────
 * Safe to re-run — if no peoples_bank offers exist it prints a message and exits.
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import mongoose from "mongoose";
import { connectDb, disconnectDb } from "../crawler/utils/db";

async function main(): Promise<void> {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error("MONGODB_URI not set");
    process.exit(1);
  }

  await connectDb(mongoUri);
  const db = mongoose.connection.db!;

  const filter = { bank: "peoples_bank" };

  const before = await db.collection("offers").countDocuments(filter);
  console.log(`[migrate] People's Bank offers in DB: ${before}`);

  if (before === 0) {
    console.log("[migrate] Nothing to do — no People's Bank offers found");
    await disconnectDb();
    return;
  }

  const sample = await db.collection("offers").find(filter).limit(5).toArray();
  console.log(
    "[migrate] Sample offers being removed:",
    sample.map((d) => `"${d.merchant}" (${d.category})`).join(", ")
  );

  const result = await db.collection("offers").deleteMany(filter);
  console.log(
    `[migrate] Deleted ${result.deletedCount} People's Bank offers — ` +
    `next crawler run will repopulate with clean data`
  );

  await disconnectDb();
}

main().catch((err) => {
  console.error("[migrate] Failed:", err);
  process.exit(1);
});
