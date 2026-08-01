/**
 * Mongoose Offer model — derived from specs/data/offer.schema.ts
 * Do NOT define the shape here — import from the Zod schema.
 */
import mongoose, { Schema, model, models } from "mongoose";
import type { Offer } from "../../../specs/data/offer.schema";

const OfferSchema = new Schema<Offer>(
  {
    bank: {
      type: String,
      required: true,
      enum: ["commercial_bank", "sampath_bank", "hnb", "nations_trust_bank", "amex_ntb", "peoples_bank", "bank_of_ceylon"],
      // No standalone index — covered by compound indexes below.
    },
    bankDisplayName: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String },

    // Structured discount fields
    offerType: {
      type: String,
      required: true,
      default: "other",
      enum: [
        "percentage",
        "cashback",
        "bogo",
        "installment",
        "fixed_amount",
        "points",
        "free_item",
        "other",
      ],
      // No standalone index — covered by compound indexes below.
    },
    discountPercentage: { type: Number, min: 0, max: 100 },
    discountLabel: { type: String },

    category: {
      type: String,
      required: true,
      enum: [
        "dining",
        "shopping",
        "travel",
        "lodging",
        "homecare",
        "clothing",
        "fuel",
        "groceries",
        "entertainment",
        "wellness",
        "healthcare",
        "installments",
        "online",
        "other",
      ],
      // No standalone index — covered by compound indexes below.
    },
    merchant: { type: String, required: true },
    merchantLogoUrl: { type: String },
    validFrom: { type: Date },
    validUntil: { type: Date },
    isExpired: { type: Boolean, default: false },
    sourceUrl: { type: String, required: true },
    scrapedAt: { type: Date, required: true, default: Date.now },

    // AI-assisted enrichment (spec 044) — all optional, degrade to undefined
    semanticSummary: { type: String },
    embedding: { type: [Number] },
    applicableDates: { type: [String] },
    enrichmentStatus: { type: String, enum: ["pending", "done", "failed"] },
  },
  {
    timestamps: true, // adds createdAt + updatedAt
  }
);

// ── Compound indexes for the common query patterns in /api/offers ────────────
//
// Each index leads with isExpired (the universal filter) and ends with the sort
// key so MongoDB can satisfy filter + sort + skip/limit from the index alone —
// no in-memory SORT stage, O(page_size) reads instead of O(collection_size).
//
// ⚠️  AFTER DEPLOYING: drop the old single-field and compound indexes in Atlas:
//   - bank (single)
//   - offerType (single)
//   - category (single)
//   - validUntil (single)
//   - isExpired (single)
//   - bank_1_category_1_isExpired_1
//   - offerType_1_discountPercentage_1
//   - validFrom_1_validUntil_1
//   Atlas → Database → Collections → Indexes → drop each one listed above.

// Default listing: { isExpired: false } sorted by createdAt desc
OfferSchema.index({ isExpired: 1, createdAt: -1, _id: -1 });

// Bank filter + default sort
OfferSchema.index({ isExpired: 1, bank: 1, createdAt: -1, _id: -1 });

// Category filter + default sort
OfferSchema.index({ isExpired: 1, category: 1, createdAt: -1, _id: -1 });

// Offer-type filter + default sort
OfferSchema.index({ isExpired: 1, offerType: 1, createdAt: -1, _id: -1 });

// "Expiring soon" sort: validUntil window query + ascending sort
OfferSchema.index({ isExpired: 1, validUntil: 1, _id: 1 });

// Upsert matching (bank + merchant + title = unique offer identity)
OfferSchema.index({ bank: 1, merchant: 1, title: 1 }, { unique: false });

// Enrichment backfill/retry queries (spec 044): find pending/failed offers
OfferSchema.index({ enrichmentStatus: 1 });

export const OfferModel =
  (models.Offer as mongoose.Model<Offer>) ?? model<Offer>("Offer", OfferSchema);
