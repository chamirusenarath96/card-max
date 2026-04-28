/**
 * Migration: clear stale AmEx calendar.svg merchantLogoUrl values
 *
 * The AmEx scraper previously stored the AmEx calendar icon SVG as the
 * merchantLogoUrl for every offer. The scraper has been fixed (no longer sets
 * merchantLogoUrl), but existing DB records still have the stale value.
 * This migration removes it so OfferImage.tsx can fall through to the
 * Google favicon fallback and then the category icon if needed.
 *
 * ── Idempotency ──────────────────────────────────────────────────────────────
 * Safe to run multiple times — only updates documents that still have the old value.
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

  const filter = {
    bank: "amex_ntb",
    merchantLogoUrl: { $regex: "calendar\\.svg" },
  };

  const before = await db.collection("offers").countDocuments(filter);
  console.log(`[migrate] AmEx offers with calendar.svg logo: ${before}`);

  if (before === 0) {
    console.log("[migrate] Nothing to do — already clean");
    await disconnectDb();
    return;
  }

  const sample = await db.collection("offers").find(filter).limit(3).toArray();
  console.log("[migrate] Sample merchants:", sample.map((d) => d.merchant).join(", "));

  const result = await db.collection("offers").updateMany(filter, {
    $unset: { merchantLogoUrl: "" },
  });
  console.log(`[migrate] Cleared merchantLogoUrl from ${result.modifiedCount} AmEx offers`);

  await disconnectDb();
}

main().catch((err) => {
  console.error("[migrate] Failed:", err);
  process.exit(1);
});
