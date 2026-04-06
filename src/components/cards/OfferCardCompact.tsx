"use client";

import type { Offer } from "../../../specs/data/offer.schema";
import { BANK_METADATA } from "../../../specs/data/offer.schema";
import { CATEGORY_LABELS, getBadgeLabel, getExpiryInfo } from "./offer-card-shared";

interface Props {
  offer: Offer;
}

export function OfferCardCompact({ offer }: Props) {
  const bankMeta = BANK_METADATA[offer.bank];
  const expiry = getExpiryInfo(offer.validUntil);
  const badgeLabel = getBadgeLabel(offer.offerType, offer.discountPercentage);

  return (
    <div className="glass p-[2px] rounded-xl hover:scale-[1.03] transition-transform duration-400">
      <a
        href={offer.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        data-testid="offer-card"
        className="bg-surface-lowest rounded-xl overflow-hidden flex flex-col h-full"
      >
        {/* Mini image area */}
        <div className="h-24 relative overflow-hidden" style={{ backgroundColor: `${bankMeta.color}15` }}>
          {offer.merchantLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={offer.merchantLogoUrl}
              alt={offer.merchant}
              className="w-full h-full object-cover"
              onError={(e) => {
                const el = e.currentTarget as HTMLImageElement;
                el.style.display = "none";
                el.parentElement!.querySelector("[data-fallback]")?.removeAttribute("hidden");
              }}
            />
          ) : null}
          <div
            data-fallback=""
            className="w-full h-full flex items-center justify-center absolute inset-0"
            {...(offer.merchantLogoUrl ? { hidden: true } : {})}
          >
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-xl font-black"
              style={{ backgroundColor: bankMeta.color }}
            >
              {offer.merchant.charAt(0).toUpperCase()}
            </div>
          </div>

          {/* Discount badge */}
          {offer.discountLabel && (
            <div
              data-testid="offer-type-badge"
              className="absolute top-1.5 right-1.5 bg-tertiary text-on-tertiary px-2 py-0.5 rounded-full font-[family-name:var(--font-space-grotesk)] text-[9px] font-bold shadow-lg"
            >
              {badgeLabel}
            </div>
          )}

          {/* Expiry badge */}
          {expiry && (
            <div
              data-testid="offer-expiry-badge"
              className={`absolute ${offer.discountLabel ? "top-7" : "top-1.5"} right-1.5 px-1.5 py-0.5 rounded-full text-[8px] font-bold ${
                expiry.isExpired ? "bg-error-container text-on-error" : "bg-tertiary-container text-on-tertiary"
              }`}
            >
              {expiry.label}
            </div>
          )}

          {/* Bank label – bottom left */}
          <span
            className="absolute bottom-1.5 left-1.5 backdrop-blur-md px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider text-white font-[family-name:var(--font-space-grotesk)]"
            style={{ backgroundColor: `${bankMeta.color}e6` }}
            data-testid="offer-bank"
          >
            {offer.bankDisplayName}
          </span>
        </div>

        {/* Compact card body */}
        <div className="p-3 flex flex-col flex-grow">
          <p
            className="font-[family-name:var(--font-epilogue)] text-sm font-black text-on-surface truncate mb-1"
            data-testid="offer-merchant"
          >
            {offer.merchant}
          </p>
          <p
            className="text-[11px] text-on-surface-variant line-clamp-1 mb-2 flex-grow"
            data-testid="offer-title"
          >
            {offer.title}
          </p>
          <div className="flex items-center justify-between">
            <span
              className="text-[9px] px-1.5 py-0.5 rounded bg-surface-high text-on-surface-variant font-medium"
              data-testid="offer-category"
            >
              {CATEGORY_LABELS[offer.category] ?? offer.category}
            </span>
            {offer.discountLabel && (
              <span className="text-[10px] font-semibold text-primary" data-testid="offer-discount">
                {offer.discountLabel}
              </span>
            )}
          </div>
        </div>
      </a>
    </div>
  );
}
