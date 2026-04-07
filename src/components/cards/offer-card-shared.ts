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

export const OFFER_TYPE_BADGE_LABEL: Record<OfferType, string> = {
  percentage: "SAVINGS",
  cashback: "CASH BACK",
  bogo: "BOGO",
  installment: "0% PLANS",
  fixed_amount: "FIXED OFF",
  points: "POINTS BOOST",
  free_item: "FREEBIE",
  other: "OFFER",
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

export function getBadgeLabel(offerType: OfferType, discountPercentage?: number): string {
  const base = OFFER_TYPE_BADGE_LABEL[offerType];
  return discountPercentage != null ? `${discountPercentage}% ${base}` : base;
}
