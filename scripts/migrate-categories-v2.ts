/**
 * Migration: align categories with AmEx NTB website taxonomy
 *
 * Changes:
 *   "health"    → "healthcare"   (AmEx uses "healthcare" and "wellness" separately)
 *
 * All other existing categories remain valid in the new schema.
 *
 * ── Idempotency ──────────────────────────────────────────────────────────────
 * Safe to run multiple times — only updates documents that still have the old value.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Usage:
 *   npx tsx scripts/migrate-categories-v2.ts
 *
 * Requires MONGODB_URI in .env.local or the environment.
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

  const db = mongoose.connection.db;
  if (!db) throw new Error("No DB connection");
  const collection = db.collection("offers");

  // health → healthcare
  const healthResult = await collection.updateMany(
    { category: "health" },
    { $set: { category: "healthcare" } }
  );
  console.log(`health → healthcare: ${healthResult.modifiedCount} documents updated`);

  const total = healthResult.modifiedCount;
  console.log(`\nMigration complete. ${total} document(s) updated.`);

  await disconnectDb();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
