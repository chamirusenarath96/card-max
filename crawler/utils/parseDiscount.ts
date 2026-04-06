/**
 * parseDiscount — classify a raw discount string into structured fields.
 *
 * Used by every bank scraper to populate offerType, discountPercentage,
 * and discountLabel from whatever free-text the bank provides.
 *
 * Returns only the three discount fields; spread into the offer object:
 *   const offer = { ...baseFields, ...parseDiscount(rawText) };
 */
import type { OfferType } from "../../specs/data/offer.schema";

export interface ParsedDiscount {
  offerType: OfferType;
  discountPercentage?: number;
  discountLabel?: string;
}

/**
 * Classify a raw discount string.
 *
 * Priority order (first match wins):
 *   1. BOGO / buy-X-get-Y
 *   2. Installment / 0% interest / EasyPay
 *   3. Loyalty points / miles / rewards multiplier
 *   4. Free item / complimentary
 *   5. Fixed cash amount (Rs. / LKR)
 *   6. Cashback (may also carry a percentage)
 *   7. Percentage discount (any "N%" pattern)
 *   8. other
 */
export function parseDiscount(raw: string | undefined | null): ParsedDiscount {
  if (!raw || !raw.trim()) return { offerType: "other" };

  const label = raw.trim();
  const lower = label.toLowerCase();

  // 1. BOGO / buy-X-get-Y
  if (/buy\s*\d*\s*get\s*\d*|b1g1|bogo/.test(lower)) {
    return { offerType: "bogo", discountLabel: label };
  }

  // 2. Installment / 0% interest
  if (
    /0\s*%\s*(interest|p\.?a\.?|installment|install)|easy\s*pay|installment\s*plan|equal\s*monthly/.test(
      lower
    )
  ) {
    return { offerType: "installment", discountPercentage: 0, discountLabel: label };
  }

  // 3. Loyalty points / miles / rewards multiplier
  if (/double\s*points|triple\s*points|(\d+)\s*x\s*(points|miles|rewards)|bonus\s*points/.test(lower)) {
    return { offerType: "points", discountLabel: label };
  }

  // 4. Free item / complimentary
  if (
    /complimentary|free\s*(item|dessert|drink|gift|meal|appetizer)|buy\s+\d+\s+get\s+\d+\s+free/.test(
      lower
    )
  ) {
    return { offerType: "free_item", discountLabel: label };
  }

  // 5. Fixed cash amount — Rs. / LKR (but NOT cashback, which is handled next)
  if (/rs\.?\s*[\d,]+|lkr\s*[\d,]+/.test(lower) && !/cashback/.test(lower)) {
    return { offerType: "fixed_amount", discountLabel: label };
  }

  // 6. Cashback (may or may not include a percentage)
  if (/cashback/.test(lower)) {
    const pct = extractMaxPercentage(label);
    return { offerType: "cashback", discountPercentage: pct, discountLabel: label };
  }

  // 7. Percentage discount
  const pct = extractMaxPercentage(label);
  if (pct !== undefined) {
    return { offerType: "percentage", discountPercentage: pct, discountLabel: label };
  }

  // 8. Fallback
  return { offerType: "other", discountLabel: label };
}

/**
 * Extract the highest percentage value from a string.
 * "Up to 45% off" → 45
 * "15% – 20% off" → 20
 * Returns undefined if no percentage found.
 */
export function extractMaxPercentage(text: string): number | undefined {
  const matches = [...text.matchAll(/(\d+(?:\.\d+)?)\s*%/g)];
  if (!matches.length) return undefined;
  return Math.max(...matches.map((m) => parseFloat(m[1])));
}
