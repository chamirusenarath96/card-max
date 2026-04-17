"use client";

import type { Offer } from "../../../specs/data/offer.schema";
import { BANK_METADATA } from "../../../specs/data/offer.schema";
import { CATEGORY_LABELS, getBadgeLabel, getExpiryInfo } from "./offer-card-shared";
import { OfferImage } from "./OfferImage";
import { DiscountDisplay } from "./DiscountDisplay";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Props {
  offer: Offer;
}

export function OfferCardCompact({ offer }: Props) {
  const bankMeta = BANK_METADATA[offer.bank];
  const expiry = getExpiryInfo(offer.validUntil);
  const badgeLabel = getBadgeLabel(offer.offerType, offer.discountPercentage);

  return (
    <div className="group relative h-full">
      {/* Glowing border on hover */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ boxShadow: `0 0 0 2px ${bankMeta.color}, 0 0 20px ${bankMeta.color}44` }}
      />

      <Card className="relative h-full overflow-hidden rounded-xl border border-border/50 bg-card shadow-sm transition-all duration-300 group-hover:-translate-y-0.5 group-hover:shadow-lg">
        <a
          href={`/offers/${offer._id}`}
          data-testid="offer-card"
          className="flex h-full flex-col"
        >
          {/* Image */}
          <div className="relative mx-2 mt-2 overflow-hidden rounded-lg bg-muted/40">
            <div className="relative aspect-[4/3]">
              <OfferImage
                offer={offer}
                bankColor={bankMeta.color}
                imgClassName="object-contain p-2"
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
              />
            </div>

            <Badge
              data-testid="offer-type-badge"
              className="absolute right-1.5 top-1.5 z-10 px-1.5 py-0.5 text-[9px] font-bold shadow"
            >
              {badgeLabel}
            </Badge>

            {expiry && (
              <Badge
                data-testid="offer-expiry-badge"
                variant={expiry.isExpired ? "destructive" : "secondary"}
                className={cn(
                  "absolute right-1.5 z-10 px-1.5 py-0.5 text-[8px] font-semibold",
                  "top-7",
                )}
              >
                {expiry.label}
              </Badge>
            )}
          </div>

          <CardContent className="flex flex-grow flex-col p-3">
            <h3
              className="mb-0.5 line-clamp-1 text-sm font-bold tracking-tight text-foreground"
              data-testid="offer-merchant"
            >
              {offer.merchant}
            </h3>

            <p
              className="mb-2 line-clamp-1 flex-grow text-[11px] text-muted-foreground"
              data-testid="offer-title"
            >
              {offer.title}
            </p>

            {/* Discount */}
            <DiscountDisplay
              label={badgeLabel}
              size="sm"
              className="mb-2"
            />

            {/* Bank + category */}
            <div className="flex flex-wrap items-center gap-1">
              <Badge
                className="border-0 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white"
                style={{ backgroundColor: `${bankMeta.color}dd` }}
                data-testid="offer-bank"
              >
                {offer.bankDisplayName}
              </Badge>
              <Badge
                variant="secondary"
                className="text-[9px] font-semibold uppercase tracking-wide"
                data-testid="offer-category"
              >
                {CATEGORY_LABELS[offer.category] ?? offer.category}
              </Badge>
            </div>
          </CardContent>
        </a>
      </Card>
    </div>
  );
}
