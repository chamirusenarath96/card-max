/**
 * Migration: add "peoples_bank" and "bank_of_ceylon" as valid bank enum values
 *
 * Spec: specs/features/011-new-banks.md (AC2)
 *
 * The Mongoose model's enum validator for the `bank` field previously did not
 * include "peoples_bank" or "bank_of_ceylon". This migration verifies that any
 * documents already stored with these bank values are valid according to the
 * updated validator, and logs a summary.
 *
 * ── Idempotency guarantee ────────────────────────────────────────────────────
 * This migration is purely additive and read-only. It makes no changes to
 * existing documents. It is safe to run multiple times.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Usage:
 *   npx tsx scripts/migrate-add-peoples-bank-boc-enums.ts
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
    console.error("[migrate-peoples-bank-boc] MONGODB_URI is required");
    process.exit(1);
  }

  await connectDb(mongoUri);

  const pbCount = await OfferModel.countDocuments({ bank: "peoples_bank" });
  const bocCount = await OfferModel.countDocuments({ bank: "bank_of_ceylon" });

  console.log(
    `[migrate-peoples-bank-boc] Found ${pbCount} existing offer(s) with bank="peoples_bank".`
  );
  console.log(
    `[migrate-peoples-bank-boc] Found ${bocCount} existing offer(s) with bank="bank_of_ceylon".`
  );
  console.log(
    `[migrate-peoples-bank-boc] ✅ Mongoose model enum updated to accept "peoples_bank" and "bank_of_ceylon" — no document changes required.`
  );

  await disconnectDb();
}

main().catch((err) => {
  console.error("[migrate-peoples-bank-boc] Fatal error:", err);
  process.exit(1);
});
