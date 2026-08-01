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

// Fields the enrichment pipeline (spec 044) actually derives from — only a
// change to one of these should re-queue the offer for enrichment. Comparing
// against them (rather than blindly re-enriching on every daily re-upsert)
// is what keeps enrichment scoped to "that crawl run's new/changed offers"
// instead of a full sweep of the collection.
const ENRICHMENT_RELEVANT_FIELDS = [
  "title",
  "description",
  "merchant",
  "category",
  "validFrom",
  "validUntil",
] as const;

type EnrichmentRelevantField = (typeof ENRICHMENT_RELEVANT_FIELDS)[number];
type ExistingOfferSnapshot = Partial<Record<EnrichmentRelevantField, unknown>> | null;

function normalizeForCompare(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function needsReEnrichment(existing: ExistingOfferSnapshot, incoming: OfferInput): boolean {
  if (!existing) return true; // brand new offer
  return ENRICHMENT_RELEVANT_FIELDS.some(
    (field) => normalizeForCompare(existing[field]) !== normalizeForCompare(incoming[field])
  );
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

      // Fail open: if this lookup itself errors, treat the offer as changed
      // so it still gets queued for enrichment rather than silently skipped.
      const existing: ExistingOfferSnapshot = await OfferModel.findOne(filter, {
        title: 1,
        description: 1,
        merchant: 1,
        category: 1,
        validFrom: 1,
        validUntil: 1,
      })
        .lean()
        .catch(() => null);

      const setFields: Record<string, unknown> = { ...offer, isExpired: false };
      if (needsReEnrichment(existing, offer)) {
        setFields.enrichmentStatus = "pending";
      }

      const result = await OfferModel.findOneAndUpdate(
        filter,
        {
          $set: setFields,
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
