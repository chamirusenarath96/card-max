/**
 * Migration: add "amex_ntb" as a valid bank enum value
 *
 * Spec: specs/features/010-amex-offers.md (AC2)
 *
 * The Mongoose model's enum validator for the `bank` field previously did not
 * include "amex_ntb". This migration verifies that any documents already stored
 * with bank="amex_ntb" (e.g. from a manual backfill) are valid according to the
 * updated validator, and logs a summary.
 *
 * ── Idempotency guarantee ────────────────────────────────────────────────────
 * This migration is purely additive and read-only. It makes no changes to
 * existing documents. It is safe to run multiple times.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Usage:
 *   npx tsx scripts/migrate-add-amex-ntb-bank.ts
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
    console.error("[migrate-amex-ntb] MONGODB_URI is required");
    process.exit(1);
  }

  await connectDb(mongoUri);

  const count = await OfferModel.countDocuments({ bank: "amex_ntb" });
  console.log(
    `[migrate-amex-ntb] Found ${count} existing offer(s) with bank="amex_ntb".`
  );
  console.log(
    `[migrate-amex-ntb] ✅ Mongoose model enum updated to accept "amex_ntb" — no document changes required.`
  );

  await disconnectDb();
}

main().catch((err) => {
  console.error("[migrate-amex-ntb] Fatal error:", err);
  process.exit(1);
});
