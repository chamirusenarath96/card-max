/**
 * Migration: delete all existing Sampath Bank offers
 *
 * The Sampath scraper had incorrect field mappings that produced low-quality
 * data (wrong titles, broken descriptions, unmapped categories, and junk
 * items from "Exclusive Offers for Visa/Mastercard Cardholders" entries).
 *
 * This migration wipes the stale Sampath offers so the next crawler run
 * repopulates them with correctly-scraped data.
 *
 * ── Idempotency ──────────────────────────────────────────────────────────────
 * Safe to re-run — if no sampath_bank offers exist it prints a message and exits.
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

  const filter = { bank: "sampath_bank" };

  const before = await db.collection("offers").countDocuments(filter);
  console.log(`[migrate] Sampath Bank offers in DB: ${before}`);

  if (before === 0) {
    console.log("[migrate] Nothing to do — no Sampath Bank offers found");
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
    `[migrate] Deleted ${result.deletedCount} Sampath Bank offers — ` +
    `next crawler run will repopulate with clean data`
  );

  await disconnectDb();
}

main().catch((err) => {
  console.error("[migrate] Failed:", err);
  process.exit(1);
});
