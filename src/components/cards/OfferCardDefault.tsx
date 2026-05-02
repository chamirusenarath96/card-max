"use client";

import { useState } from "react";
import type { Offer } from "../../../specs/data/offer.schema";
import { BANK_METADATA } from "../../../specs/data/offer.schema";
import { CATEGORY_LABELS, getBadgeLabel, getExpiryInfo } from "./offer-card-shared";
import { OfferImage } from "./OfferImage";
import { DiscountDisplay } from "./DiscountDisplay";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const DESC_LIMIT = 120;

interface Props {
  offer: Offer;
}

export function OfferCardDefault({ offer }: Props) {
  const bankMeta = BANK_METADATA[offer.bank];
  const expiry = getExpiryInfo(offer.validUntil);
  const badgeLabel = getBadgeLabel(offer.offerType, offer.discountPercentage);
  const [descExpanded, setDescExpanded] = useState(false);

  const desc = offer.description ?? "";
  const descTruncated = desc.length > DESC_LIMIT && !descExpanded
    ? desc.slice(0, DESC_LIMIT).trimEnd() + "…"
    : desc;

  return (
    /**
     * Outer wrapper handles the hover glow — kept separate from the Card so
     * the Card's overflow-hidden doesn't clip the box-shadow.
     */
    <div
      className={cn("group relative h-full", offer.isExpired && "opacity-50 grayscale")}
      data-testid="offer-card"
    >
      {/* Glowing border — fades in on hover using bank brand colour */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ boxShadow: `0 0 0 2px ${bankMeta.color}, 0 0 28px ${bankMeta.color}55` }}
      />

      <Card className="relative h-full overflow-hidden rounded-2xl border border-border/50 bg-card shadow-sm transition-all duration-300 group-hover:-translate-y-0.5 group-hover:shadow-xl">
        <div className="flex h-full flex-col">
          {/* ── Image area ─────────────────────────────────────────────── */}
          <div className="relative mx-3 mt-3 overflow-hidden rounded-xl bg-muted/40">
            {/* Fixed aspect ratio — same shape as the product card screenshot */}
            <div className="relative aspect-[4/3]">
              <OfferImage
                offer={offer}
                bankColor={bankMeta.color}
                imgClassName="object-contain p-3"
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              />
            </div>

            {/* Offer type badge — top-right corner */}
            <Badge
              data-testid="offer-type-badge"
              className="absolute right-2 top-2 z-10 text-[10px] font-bold tracking-wide shadow"
            >
              {badgeLabel}
            </Badge>

            {/* Expiry badge — below offer type badge */}
            {expiry && (
              <Badge
                data-testid="offer-expiry-badge"
                variant={expiry.isExpired ? "destructive" : "secondary"}
                className="absolute right-2 top-8 z-10 text-[10px] font-semibold"
              >
                {expiry.label}
              </Badge>
            )}
          </div>

          {/* ── Content ────────────────────────────────────────────────── */}
          <CardContent className="flex flex-grow flex-col p-4">
            {/* Merchant name */}
            <h3
              className="mb-1 line-clamp-1 text-base font-bold tracking-tight text-foreground"
              data-testid="offer-merchant"
            >
              {offer.merchant}
            </h3>

            {/* Title */}
            <p
              className="mb-2 line-clamp-2 text-xs text-muted-foreground"
              data-testid="offer-title"
            >
              {offer.title}
            </p>

            {/* Description with Show more/less */}
            {desc && (
              <div className="mb-3 flex-grow">
                <p className="text-xs text-muted-foreground" data-testid="offer-description">
                  {descTruncated}
                </p>
                {desc.length > DESC_LIMIT && (
                  <button
                    type="button"
                    onClick={() => setDescExpanded((v) => !v)}
                    className="mt-0.5 text-[10px] font-semibold text-primary hover:underline"
                    data-testid="offer-desc-toggle"
                  >
                    {descExpanded ? "Show less" : "Show more"}
                  </button>
                )}
              </div>
            )}

            {/* Discount — percentage in accent, descriptor word softer */}
            <DiscountDisplay
              label={badgeLabel}
              size="md"
              className="mb-2"
            />

            {/* Validity */}
            {offer.validUntil && (
              <p className="mb-3 text-[11px] text-muted-foreground" data-testid="offer-expiry">
                Until{" "}
                {new Date(offer.validUntil).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </p>
            )}

            {/* Bottom row — bank + category */}
            <div className="mt-auto flex flex-wrap items-center gap-1.5">
              <Badge
                className={cn(
                  "border-0 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white",
                )}
                style={{ backgroundColor: `${bankMeta.color}dd` }}
                data-testid="offer-bank"
              >
                {offer.bankDisplayName}
              </Badge>
              <Badge
                variant="secondary"
                className="text-[10px] font-semibold uppercase tracking-wide"
                data-testid="offer-category"
              >
                {CATEGORY_LABELS[offer.category] ?? offer.category}
              </Badge>
            </div>
          </CardContent>
        </div>
      </Card>
    </div>
  );
}
