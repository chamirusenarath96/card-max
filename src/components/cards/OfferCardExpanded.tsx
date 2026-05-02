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

const DESC_LIMIT = 200;

interface Props {
  offer: Offer;
}

export function OfferCardExpanded({ offer }: Props) {
  const bankMeta = BANK_METADATA[offer.bank];
  const expiry = getExpiryInfo(offer.validUntil);
  const badgeLabel = getBadgeLabel(offer.offerType, offer.discountPercentage);
  const [descExpanded, setDescExpanded] = useState(false);

  const desc = offer.description ?? "";
  const descTruncated = desc.length > DESC_LIMIT && !descExpanded
    ? desc.slice(0, DESC_LIMIT).trimEnd() + "…"
    : desc;

  return (
    <div
      className={cn("group relative h-full", offer.isExpired && "opacity-50 grayscale")}
      data-testid="offer-card"
    >
      {/* Glowing border on hover */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ boxShadow: `0 0 0 2px ${bankMeta.color}, 0 0 32px ${bankMeta.color}55` }}
      />

      <Card className="relative h-full overflow-hidden rounded-2xl border border-border/50 bg-card shadow-sm transition-all duration-300 group-hover:-translate-y-0.5 group-hover:shadow-xl">
        <div className="flex h-full flex-col md:flex-row">
          {/* ── Image ──────────────────────────────────────────────────── */}
          <div className="relative m-3 flex-shrink-0 overflow-hidden rounded-xl bg-muted/40 md:m-4 md:w-72">
            <div className="relative aspect-[4/3] md:aspect-auto md:h-full md:min-h-[220px]">
              <OfferImage
                offer={offer}
                bankColor={bankMeta.color}
                imgClassName="object-contain p-4"
                sizes="(max-width: 768px) 100vw, 288px"
              />
            </div>

            <Badge
              data-testid="offer-type-badge"
              className="absolute right-2 top-2 z-10 px-2 py-0.5 text-xs font-bold shadow"
            >
              {badgeLabel}
            </Badge>

            {expiry && (
              <Badge
                data-testid="offer-expiry-badge"
                variant={expiry.isExpired ? "destructive" : "secondary"}
                className="absolute right-2 top-9 z-10 text-[10px] font-semibold"
              >
                {expiry.label}
              </Badge>
            )}
          </div>

          {/* ── Content ────────────────────────────────────────────────── */}
          <CardContent className="flex flex-grow flex-col p-5">
            <h3
              className="mb-2 text-xl font-bold tracking-tight text-foreground"
              data-testid="offer-merchant"
            >
              {offer.merchant}
            </h3>

            <p
              className="mb-2 text-sm text-muted-foreground"
              data-testid="offer-title"
            >
              {offer.title}
            </p>

            {/* Description with Show more/less */}
            {desc && (
              <div className="mb-3 flex-grow">
                <p className="text-sm text-muted-foreground" data-testid="offer-description">
                  {descTruncated}
                </p>
                {desc.length > DESC_LIMIT && (
                  <button
                    type="button"
                    onClick={() => setDescExpanded((v) => !v)}
                    className="mt-1 text-xs font-semibold text-primary hover:underline"
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
              size="lg"
              className="mb-3"
            />

            {/* Dates */}
            <div className="mb-4 flex flex-wrap items-center gap-3">
              {offer.validFrom && (
                <p className="text-xs text-muted-foreground">
                  From{" "}
                  {new Date(offer.validFrom).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              )}
              {offer.validUntil && (
                <p className="text-xs text-muted-foreground" data-testid="offer-expiry">
                  Until{" "}
                  {new Date(offer.validUntil).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              )}
            </div>

            {/* Bank + category row */}
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge
                className="border-0 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white"
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
