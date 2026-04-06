import type { Offer, OfferType } from "../../specs/data/offer.schema";
import { BANK_METADATA } from "../../specs/data/offer.schema";

interface Props {
  offer: Offer;
}

const CATEGORY_LABELS: Record<string, string> = {
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

const OFFER_TYPE_CONFIG: Record<OfferType, { label: string; className: string }> = {
  percentage: { label: "% Off", className: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  cashback: { label: "Cashback", className: "bg-blue-50 text-blue-700 ring-blue-600/20" },
  bogo: { label: "BOGO", className: "bg-purple-50 text-purple-700 ring-purple-600/20" },
  installment: { label: "0% Plans", className: "bg-amber-50 text-amber-700 ring-amber-600/20" },
  fixed_amount: { label: "Fixed Off", className: "bg-rose-50 text-rose-700 ring-rose-600/20" },
  points: { label: "Points", className: "bg-indigo-50 text-indigo-700 ring-indigo-600/20" },
  free_item: { label: "Freebie", className: "bg-teal-50 text-teal-700 ring-teal-600/20" },
  other: { label: "Offer", className: "bg-gray-50 text-gray-700 ring-gray-600/20" },
};

function getExpiryBadge(
  validUntil?: Date | string
): { label: string; className: string } | null {
  if (!validUntil) return null;
  const date = validUntil instanceof Date ? validUntil : new Date(validUntil);
  if (isNaN(date.getTime())) return null;
  const now = new Date();
  const daysUntil = Math.floor(
    (date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (daysUntil < 0)
    return { label: "Expired", className: "bg-red-100 text-red-700" };
  if (daysUntil <= 7)
    return { label: "Expires soon", className: "bg-orange-100 text-orange-700" };
  return null;
}

export function OfferCard({ offer }: Props) {
  const bankMeta = BANK_METADATA[offer.bank];
  const expiry = getExpiryBadge(offer.validUntil);
  const offerType = OFFER_TYPE_CONFIG[offer.offerType];

  return (
    <a
      href={offer.sourceUrl}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="offer-card"
      className="group flex flex-col rounded-xl border border-gray-200 bg-white shadow-sm hover:shadow-lg hover:border-gray-300 transition-all duration-200 overflow-hidden"
    >
      <div
        className="h-1.5 flex-shrink-0 transition-all duration-200 group-hover:h-2"
        style={{ backgroundColor: bankMeta.color }}
      />

      <div className="p-4 flex flex-col gap-3 flex-1">
        {/* Top row: bank + badges */}
        <div className="flex items-center justify-between gap-2">
          <span
            className="text-xs font-semibold uppercase tracking-wide"
            style={{ color: bankMeta.color }}
            data-testid="offer-bank"
          >
            {offer.bankDisplayName}
          </span>
          <div className="flex items-center gap-1.5">
            {offerType && offer.offerType !== "other" && (
              <span
                data-testid="offer-type-badge"
                className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full ring-1 ring-inset ${offerType.className}`}
              >
                {offerType.label}
              </span>
            )}
            {expiry && (
              <span
                data-testid="offer-expiry-badge"
                className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${expiry.className}`}
              >
                {expiry.label}
              </span>
            )}
          </div>
        </div>

        {/* Merchant + discount */}
        <div className="flex items-center gap-3">
          {offer.merchantLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={offer.merchantLogoUrl}
              alt={offer.merchant}
              className="h-10 w-10 rounded-lg object-contain border border-gray-100 p-1 flex-shrink-0"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <div
              aria-hidden="true"
              className="h-10 w-10 rounded-lg flex items-center justify-center text-white text-lg font-bold flex-shrink-0"
              style={{ backgroundColor: bankMeta.color }}
            >
              {offer.merchant.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p
              className="font-semibold text-gray-900 truncate"
              data-testid="offer-merchant"
            >
              {offer.merchant}
            </p>
            {offer.discountLabel && (
              <p
                className="text-sm font-medium text-emerald-600"
                data-testid="offer-discount"
              >
                {offer.discountLabel}
              </p>
            )}
          </div>
        </div>

        {/* Offer title */}
        <p
          className="text-sm text-gray-600 line-clamp-2 flex-1"
          data-testid="offer-title"
        >
          {offer.title}
        </p>

        {/* Footer: category + validity */}
        <div className="flex items-center justify-between gap-2 mt-auto pt-2 border-t border-gray-100">
          <span
            className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600"
            data-testid="offer-category"
          >
            {CATEGORY_LABELS[offer.category] ?? offer.category}
          </span>
          {offer.validUntil && (
            <span
              className="text-xs text-gray-400"
              data-testid="offer-expiry"
            >
              Until{" "}
              {new Date(offer.validUntil).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </span>
          )}
        </div>
      </div>
    </a>
  );
}
