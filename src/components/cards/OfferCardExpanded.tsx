"use client";

import type { Offer } from "../../../specs/data/offer.schema";
import { BANK_METADATA } from "../../../specs/data/offer.schema";
import { CATEGORY_LABELS, getBadgeLabel, getExpiryInfo } from "./offer-card-shared";

interface Props {
  offer: Offer;
}

export function OfferCardExpanded({ offer }: Props) {
  const bankMeta = BANK_METADATA[offer.bank];
  const expiry = getExpiryInfo(offer.validUntil);
  const badgeLabel = getBadgeLabel(offer.offerType, offer.discountPercentage);

  return (
    <div className="glass p-[3px] rounded-2xl hover:scale-[1.01] transition-transform duration-500">
      <a
        href={offer.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        data-testid="offer-card"
        className="bg-surface-lowest rounded-2xl overflow-hidden flex flex-col md:flex-row h-full"
      >
        {/* Large image area */}
        <div className="h-56 md:h-auto md:w-80 relative overflow-hidden flex-shrink-0" style={{ backgroundColor: `${bankMeta.color}15` }}>
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
            <div className="w-24 h-24 rounded-2xl flex items-center justify-center text-white text-5xl font-black" style={{ backgroundColor: bankMeta.color }}>
              {offer.merchant.charAt(0).toUpperCase()}
            </div>
          </div>

          {offer.discountLabel && (
            <div data-testid="offer-type-badge" className="absolute top-4 right-4 bg-tertiary text-on-tertiary px-4 py-1.5 rounded-full font-[family-name:var(--font-space-grotesk)] text-sm font-bold shadow-lg">
              {badgeLabel}
            </div>
          )}

          {expiry && (
            <div data-testid="offer-expiry-badge" className={`absolute ${offer.discountLabel ? "top-14" : "top-4"} right-4 px-3 py-1 rounded-full text-xs font-bold ${expiry.isExpired ? "bg-error-container text-on-error" : "bg-tertiary-container text-on-tertiary"}`}>
              {expiry.label}
            </div>
          )}

          <div className="absolute bottom-4 left-4 flex gap-2">
            <span className="backdrop-blur-md px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider text-white font-[family-name:var(--font-space-grotesk)]" style={{ backgroundColor: `${bankMeta.color}e6` }} data-testid="offer-bank">
              {offer.bankDisplayName}
            </span>
            <span className="bg-on-surface/80 text-surface backdrop-blur-md px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider font-[family-name:var(--font-space-grotesk)]" data-testid="offer-category">
              {CATEGORY_LABELS[offer.category] ?? offer.category}
            </span>
          </div>
        </div>

        {/* Expanded body */}
        <div className="p-6 flex flex-col flex-grow">
          <h4 className="font-[family-name:var(--font-epilogue)] text-2xl font-black text-on-surface mb-3" data-testid="offer-merchant">{offer.merchant}</h4>
          <p className="text-on-surface-variant text-base mb-4 flex-grow" data-testid="offer-title">{offer.title}</p>
          {offer.description && <p className="text-on-surface-variant text-sm mb-4">{offer.description}</p>}
          {offer.discountLabel && <p className="text-base font-semibold text-primary mb-4" data-testid="offer-discount">{offer.discountLabel}</p>}
          <div className="flex items-center gap-4 mb-5">
            {offer.validFrom && (
              <p className="text-xs text-on-surface-variant">
                From {new Date(offer.validFrom).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
              </p>
            )}
            {offer.validUntil && (
              <p className="text-xs text-on-surface-variant" data-testid="offer-expiry">
                Until {new Date(offer.validUntil).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
              </p>
            )}
          </div>
          <div className="inline-flex self-start py-3 px-8 border-2 border-outline-variant rounded-xl font-[family-name:var(--font-space-grotesk)] font-bold text-primary text-sm hover:bg-primary hover:text-on-primary hover:border-primary transition-all">
            View Card Details
          </div>
        </div>
      </a>
    </div>
  );
}
