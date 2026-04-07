/**
 * offer.schema.ts — SINGLE SOURCE OF TRUTH for the Offer data model
 *
 * All Mongoose models, API responses, and UI types are derived from this schema.
 * Do NOT define offer types elsewhere — import from here.
 */
import { z } from "zod";

export const BankSchema = z.enum([
  "commercial_bank",
  "sampath_bank",
  "hnb",
  "nations_trust_bank",
]);

export const CategorySchema = z.enum([
  "dining",
  "shopping",
  "travel",
  "fuel",
  "groceries",
  "entertainment",
  "health",
  "online",
  "other",
]);

/**
 * How the discount is structured.
 * Used to enable filtering by type (e.g. only BOGO, only percentage ≥ 20%).
 *
 * percentage   – "15% off", "Up to 45% discount", "20% savings"
 * cashback     – "10% cashback", "Rs. 500 cashback on spend"
 * bogo         – "Buy 1 Get 1 Free", "Buy 2 Get 1"
 * installment  – "0% interest – 12 months", "Easy Pay 24 months"
 * fixed_amount – "Rs. 1,000 off on bills above Rs. 5,000"
 * points       – "Double Points every Tuesday", "5x Miles"
 * free_item    – "Complimentary dessert", "Free item with purchase"
 * other        – anything that doesn't fit the above categories
 */
export const OfferTypeSchema = z.enum([
  "percentage",
  "cashback",
  "bogo",
  "installment",
  "fixed_amount",
  "points",
  "free_item",
  "other",
]);

export const OfferSchema = z.object({
  _id: z.string().optional(),

  // Bank details
  bank: BankSchema,
  bankDisplayName: z.string().min(1),

  // Offer content
  title: z.string().min(1).max(300),
  description: z.string().max(2000).optional(),

  /**
   * Structured discount fields — prefer these over discountLabel for queries.
   *
   * offerType         – enum classifying the nature of the deal
   * discountPercentage – numeric value when offerType is "percentage" or "cashback"
   *                      e.g. "Up to 45% off" → 45
   * discountLabel      – original human-readable string for display
   *                      e.g. "Up to 45% off", "Buy 1 Get 1 Free"
   */
  offerType: OfferTypeSchema.default("other"),
  discountPercentage: z.number().min(0).max(100).optional(),
  discountLabel: z.string().max(100).optional(),

  category: CategorySchema,

  // Merchant / location
  merchant: z.string().min(1).max(200),
  merchantLogoUrl: z.string().url().optional(),

  // Validity
  validFrom: z.coerce.date().optional(),
  validUntil: z.coerce.date().optional(),
  isExpired: z.boolean().default(false),

  // Source
  sourceUrl: z.string().url(),
  scrapedAt: z.coerce.date(),

  // Meta
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
});

export type Offer = z.infer<typeof OfferSchema>;
export type Bank = z.infer<typeof BankSchema>;
export type Category = z.infer<typeof CategorySchema>;
export type OfferType = z.infer<typeof OfferTypeSchema>;

// Input schema for creating/upserting (no _id, timestamps handled by DB)
export const OfferInputSchema = OfferSchema.omit({
  _id: true,
  createdAt: true,
  updatedAt: true,
  isExpired: true,
}).extend({
  isExpired: z.boolean().default(false).optional(),
});

export type OfferInput = z.infer<typeof OfferInputSchema>;

/**
 * Schema for API query params on GET /api/offers
 *
 * Filtering dimensions:
 *   bank, category, merchant  – standard dimension filters
 *   offerType                 – filter by deal structure
 *   minDiscount / maxDiscount – filter by numeric percentage (requires offerType=percentage|cashback)
 *   activeOn                  – ISO date; returns offers whose validity period contains this date
 *   activeFrom / activeTo     – ISO date range; returns offers overlapping [activeFrom, activeTo]
 *   includeExpired            – "true" to include isExpired=true offers (default: false)
 *   q                         – full-text search on title, description, merchant
 *   page / limit              – pagination
 */
export const SortSchema = z.enum(["latest", "expiringSoon"]);

export const OfferQuerySchema = z.object({
  bank: BankSchema.optional(),
  category: CategorySchema.optional(),
  merchant: z.string().optional(),
  offerType: OfferTypeSchema.optional(),
  minDiscount: z.coerce.number().min(0).max(100).optional(),
  maxDiscount: z.coerce.number().min(0).max(100).optional(),
  activeOn: z.coerce.date().optional(),
  activeFrom: z.coerce.date().optional(),
  activeTo: z.coerce.date().optional(),
  includeExpired: z
    .string()
    .transform((v) => v === "true")
    .optional(),
  q: z.string().optional(),
  sort: SortSchema.default("latest"),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type OfferQuery = z.infer<typeof OfferQuerySchema>;

// Bank metadata for display
export const BANK_METADATA: Record<
  Bank,
  { displayName: string; color: string; website: string }
> = {
  commercial_bank: {
    displayName: "Commercial Bank",
    color: "#1B3A6B",
    website: "https://www.combank.lk",
  },
  sampath_bank: {
    displayName: "Sampath Bank",
    color: "#E31E24",
    website: "https://www.sampath.lk",
  },
  hnb: {
    displayName: "Hatton National Bank",
    color: "#00539F",
    website: "https://www.hnb.lk",
  },
  nations_trust_bank: {
    displayName: "Nations Trust Bank",
    color: "#004B87",
    website: "https://www.nationstrust.com",
  },
};
