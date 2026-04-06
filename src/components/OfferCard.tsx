import type { Offer } from "../../specs/data/offer.schema";
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

function getExpiryBadge(
  validUntil?: Date | string
): { label: string; className: string } | null {
  if (!validUntil) return null;
  const date = validUntil instanceof Date ? validUntil : new Date(validUntil);
  if (isNaN(date.getTime())) return null;
  const now = new Date();
  const daysUntil = Math.floor((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (daysUntil < 0) return { label: "Expired", className: "bg-red-100 text-red-700" };
  if (daysUntil <= 7) return { label: "Expires soon", className: "bg-orange-100 text-orange-700" };
  return null;
}

export function OfferCard({ offer }: Props) {
  const bankMeta = BANK_METADATA[offer.bank];
  const expiry = getExpiryBadge(offer.validUntil);

  return (
    <a
      href={offer.sourceUrl}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="offer-card"
      className="group flex flex-col rounded-xl border border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow overflow-hidden"
    >
      {/* Bank brand colour bar */}
      <div className="h-1.5 flex-shrink-0" style={{ backgroundColor: bankMeta.color }} />

      <div className="p-4 flex flex-col gap-3 flex-1">
        {/* Bank label + expiry badge */}
        <div className="flex items-center justify-between gap-2">
          <span
            className="text-xs font-semibold uppercase tracking-wide"
            style={{ color: bankMeta.color }}
            data-testid="offer-bank"
          >
            {offer.bankDisplayName}
          </span>
          {expiry && (
            <span
              data-testid="offer-expiry-badge"
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${expiry.className}`}
            >
              {expiry.label}
            </span>
          )}
        </div>

        {/* Merchant logo / initial + discount */}
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
                className="text-sm font-medium text-green-700"
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
            <span className="text-xs text-gray-400" data-testid="offer-expiry">
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
