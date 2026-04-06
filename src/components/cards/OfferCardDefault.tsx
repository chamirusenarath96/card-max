"use client";

import type { Offer } from "../../../specs/data/offer.schema";
import { BANK_METADATA } from "../../../specs/data/offer.schema";
import { CATEGORY_LABELS, getBadgeLabel, getExpiryInfo } from "./offer-card-shared";

interface Props {
  offer: Offer;
}

export function OfferCardDefault({ offer }: Props) {
  const bankMeta = BANK_METADATA[offer.bank];
  const expiry = getExpiryInfo(offer.validUntil);
  const badgeLabel = getBadgeLabel(offer.offerType, offer.discountPercentage);

  return (
    <div className="glass p-[3px] rounded-2xl hover:scale-[1.02] transition-transform duration-500">
      <a
        href={offer.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        data-testid="offer-card"
        className="bg-surface-lowest rounded-2xl overflow-hidden flex flex-col h-full"
      >
        {/* Image area */}
        <div className="h-44 relative overflow-hidden" style={{ backgroundColor: `${bankMeta.color}15` }}>
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
          {/* Fallback avatar — shown when no URL or image fails to load */}
          <div
            data-fallback=""
            className="w-full h-full flex items-center justify-center absolute inset-0"
            {...(offer.merchantLogoUrl ? { hidden: true } : {})}
          >
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-white text-4xl font-black" style={{ backgroundColor: bankMeta.color }}>
              {offer.merchant.charAt(0).toUpperCase()}
            </div>
          </div>

          {offer.discountLabel && (
            <div data-testid="offer-type-badge" className="absolute top-3 right-3 bg-tertiary text-on-tertiary px-3 py-1 rounded-full font-[family-name:var(--font-space-grotesk)] text-xs font-bold shadow-lg">
              {badgeLabel}
            </div>
          )}

          {expiry && (
            <div data-testid="offer-expiry-badge" className={`absolute ${offer.discountLabel ? "top-12" : "top-3"} right-3 px-2 py-0.5 rounded-full text-[10px] font-bold ${expiry.isExpired ? "bg-error-container text-on-error" : "bg-tertiary-container text-on-tertiary"}`}>
              {expiry.label}
            </div>
          )}

          <div className="absolute bottom-3 left-3 flex gap-2">
            <span className="backdrop-blur-md px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider text-white font-[family-name:var(--font-space-grotesk)]" style={{ backgroundColor: `${bankMeta.color}e6` }} data-testid="offer-bank">
              {offer.bankDisplayName}
            </span>
            <span className="bg-on-surface/80 text-surface backdrop-blur-md px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider font-[family-name:var(--font-space-grotesk)]" data-testid="offer-category">
              {CATEGORY_LABELS[offer.category] ?? offer.category}
            </span>
          </div>
        </div>

        <div className="p-5 flex flex-col flex-grow">
          <h4 className="font-[family-name:var(--font-epilogue)] text-xl font-black text-on-surface mb-2" data-testid="offer-merchant">{offer.merchant}</h4>
          <p className="text-on-surface-variant text-sm mb-5 flex-grow line-clamp-2" data-testid="offer-title">{offer.title}</p>
          {offer.discountLabel && <p className="text-sm font-semibold text-primary mb-4" data-testid="offer-discount">{offer.discountLabel}</p>}
          {offer.validUntil && (
            <p className="text-xs text-on-surface-variant mb-4" data-testid="offer-expiry">
              Until {new Date(offer.validUntil).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
            </p>
          )}
          <div className="w-full py-2.5 border-2 border-outline-variant rounded-xl font-[family-name:var(--font-space-grotesk)] font-bold text-primary text-center text-sm hover:bg-primary hover:text-on-primary hover:border-primary transition-all">
            View Card Details
          </div>
        </div>
      </a>
    </div>
  );
}
