import type { OfferType } from "../../../specs/data/offer.schema";

export const CATEGORY_LABELS: Record<string, string> = {
  dining: "Dining",
  shopping: "Shopping",
  travel: "Travel",
  fuel: "Fuel",
  groceries: "Groceries",
  entertainment: "Entertainment",
  health: "Health",
  online: "Online",
  other: "Other",
};

/** User-facing label shown in the badge for each offer type */
export const OFFER_TYPE_BADGE_LABEL: Record<OfferType, string> = {
  percentage:   "OFF",
  cashback:     "CASHBACK",
  bogo:         "BUY 1 GET 1",
  installment:  "INSTALLMENT",
  fixed_amount: "FIXED OFF",
  points:       "POINTS",
  free_item:    "FREE ITEM",
  other:        "SPECIAL OFFER",
};

export type CardSize = "compact" | "default" | "expanded";

export function getExpiryInfo(validUntil?: Date | string): { label: string; isExpired: boolean } | null {
  if (!validUntil) return null;
  const date = validUntil instanceof Date ? validUntil : new Date(validUntil);
  if (isNaN(date.getTime())) return null;
  const now = new Date();
  const daysUntil = Math.floor((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (daysUntil < 0) return { label: "Expired", isExpired: true };
  if (daysUntil <= 7) return { label: "Expires soon", isExpired: false };
  return null;
}

/**
 * Returns the badge label for an offer.
 * Percentage prefix is only shown for `percentage` and `cashback` types
 * with a meaningful positive value — avoids showing "0% INSTALLMENT" etc.
 */
export function getBadgeLabel(offerType: OfferType, discountPercentage?: number): string {
  const base = OFFER_TYPE_BADGE_LABEL[offerType];
  if (
    (offerType === "percentage" || offerType === "cashback") &&
    discountPercentage !== undefined &&
    discountPercentage !== null &&
    discountPercentage > 0
  ) {
    return `${discountPercentage}% ${base}`;
  }
  return base;
}
