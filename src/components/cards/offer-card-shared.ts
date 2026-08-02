import type { OfferType } from "../../../specs/data/offer.schema";

export const CATEGORY_LABELS: Record<string, string> = {
  dining: "Dining",
  shopping: "Shopping",
  travel: "Travel",
  homecare: "Home Care",
  fuel: "Fuel",
  groceries: "Groceries",
  entertainment: "Entertainment",
  wellness: "Wellness",
  healthcare: "Healthcare",
  installments: "Installments",
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

/**
 * Returns a human-readable validity period string for an offer.
 *
 * - Both dates present: "15 Nov – 31 Dec 2026" (omits year on `from` if same year)
 * - Only validFrom:    "From 15 Nov 2026"
 * - Only validUntil:  "Until 31 Dec 2026"
 * - Neither:          null
 */
export function formatValidityPeriod(
  validFrom?: Date | string | null,
  validUntil?: Date | string | null,
): string | null {
  const from = validFrom ? new Date(validFrom) : null;
  const until = validUntil ? new Date(validUntil) : null;
  if (from && isNaN(from.getTime())) return null;
  if (until && isNaN(until.getTime())) return null;

  function fmt(d: Date, includeYear: boolean): string {
    return d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      ...(includeYear ? { year: "numeric" } : {}),
    });
  }

  if (from && until) {
    const sameYear = from.getFullYear() === until.getFullYear();
    return `${fmt(from, !sameYear)} – ${fmt(until, true)}`;
  }
  if (from) return `From ${fmt(from, true)}`;
  if (until) return `Until ${fmt(until, true)}`;
  return null;
}

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
 *
 * Edge case: `offerType === "percentage"` with `discountPercentage === 0` means
 * the offer was misclassified by an older scraper (e.g. "0% installments for 6 months"
 * before the generalised installment regex landed). Treat it as an installment offer
 * so the badge shows "INSTALLMENT" instead of "OFF".
 */
export function getBadgeLabel(offerType: OfferType, discountPercentage?: number): string {
  // Legacy mis-classification: percentage type with 0% → really an installment offer
  if (offerType === "percentage" && discountPercentage === 0) {
    return OFFER_TYPE_BADGE_LABEL["installment"];
  }

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
