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
      enum: ["commercial_bank", "sampath_bank", "hnb", "nations_trust_bank", "amex_ntb"],
      index: true,
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
      index: true,
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
        "fuel",
        "groceries",
        "entertainment",
        "health",
        "online",
        "other",
      ],
      index: true,
    },
    merchant: { type: String, required: true },
    merchantLogoUrl: { type: String },
    validFrom: { type: Date },
    validUntil: { type: Date, index: true },
    isExpired: { type: Boolean, default: false, index: true },
    sourceUrl: { type: String, required: true },
    scrapedAt: { type: Date, required: true, default: Date.now },
  },
  {
    timestamps: true, // adds createdAt + updatedAt
  }
);

// Text index for keyword search (spec 003)
OfferSchema.index({ title: "text", description: "text", merchant: "text" });

// Compound index for upsert matching (bank + merchant + title = unique offer identity)
OfferSchema.index({ bank: 1, merchant: 1, title: 1 }, { unique: false });

// Compound index to support common filter combinations efficiently
OfferSchema.index({ bank: 1, category: 1, isExpired: 1 });
OfferSchema.index({ offerType: 1, discountPercentage: 1 });
OfferSchema.index({ validFrom: 1, validUntil: 1 });

export const OfferModel =
  (models.Offer as mongoose.Model<Offer>) ?? model<Offer>("Offer", OfferSchema);
