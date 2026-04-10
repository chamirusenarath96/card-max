/**
 * Crawler DB utilities — upsert and expire offers
 */
import mongoose from "mongoose";
import { OfferModel } from "../../src/lib/models/offer.model";
import type { OfferInput } from "../../specs/data/offer.schema";

export async function connectDb(uri: string): Promise<void> {
  await mongoose.connect(uri, { dbName: "card-max" });
  const db = mongoose.connection.db;
  const dbName = db?.databaseName ?? "unknown";
  console.log(`[db] Connected to MongoDB — database: "${dbName}"`);
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
  console.log("[db] Disconnected from MongoDB");
}

export interface UpsertResult {
  inserted: number;
  updated: number;
  skipped: number;
}

/**
 * Upsert a batch of offers for a given bank.
 * Matches on: bank + merchant + title (case-insensitive)
 * Returns counts of inserted/updated/skipped.
 */
export async function upsertOffers(offers: OfferInput[]): Promise<UpsertResult> {
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const offer of offers) {
    try {
      const filter = {
        bank: offer.bank,
        merchant: { $regex: new RegExp(`^${escapeRegex(offer.merchant)}$`, "i") },
        title: { $regex: new RegExp(`^${escapeRegex(offer.title)}$`, "i") },
      };

      const result = await OfferModel.findOneAndUpdate(
        filter,
        {
          $set: { ...offer, isExpired: false },
          $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true, new: true, lean: true }
      );

      if (result) {
        // Check if it was newly inserted (createdAt === updatedAt ~ within 1s)
        const doc = result as { createdAt?: Date; updatedAt?: Date };
        const isNew =
          doc.createdAt && doc.updatedAt &&
          Math.abs(doc.createdAt.getTime() - doc.updatedAt.getTime()) < 1000;
        if (isNew) inserted++;
        else updated++;
      }
    } catch (err) {
      console.error(`[db] Failed to upsert offer: ${offer.title}`, err);
      skipped++;
    }
  }

  return { inserted, updated, skipped };
}

/**
 * Mark all offers for a bank that were NOT in the latest scrape as expired.
 */
export async function expireStaleOffers(
  bank: string,
  activeOffers: OfferInput[]
): Promise<number> {
  const activeTitles = activeOffers.map((o) => o.title);

  const result = await OfferModel.updateMany(
    {
      bank,
      title: { $nin: activeTitles },
      isExpired: false,
    },
    { $set: { isExpired: true } }
  );

  return result.modifiedCount;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
