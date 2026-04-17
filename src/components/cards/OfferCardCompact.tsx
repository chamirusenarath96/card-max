"use client";

import type { Offer } from "../../../specs/data/offer.schema";
import { BANK_METADATA } from "../../../specs/data/offer.schema";
import { CATEGORY_LABELS, getBadgeLabel, getExpiryInfo } from "./offer-card-shared";
import { OfferImage } from "./OfferImage";
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
    <Card className="h-full gap-0 overflow-hidden py-0 shadow-sm transition-shadow hover:shadow-md">
      <a
        href={`/offers/${offer._id}`}
        data-testid="offer-card"
        className="flex h-full flex-col"
      >
        <div className="relative h-24 overflow-hidden" style={{ backgroundColor: `${bankMeta.color}18` }}>
          <OfferImage
            offer={offer}
            bankColor={bankMeta.color}
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
          />

          {offer.discountLabel ? (
            <Badge data-testid="offer-type-badge" className="absolute top-1.5 right-1.5 z-10 px-1.5 py-0.5 text-[9px] font-semibold shadow">
              {badgeLabel}
            </Badge>
          ) : null}

          {expiry ? (
            <Badge
              data-testid="offer-expiry-badge"
              variant={expiry.isExpired ? "destructive" : "secondary"}
              className={cn(
                "absolute right-1.5 z-10 px-1.5 py-0.5 text-[8px] font-semibold",
                offer.discountLabel ? "top-7" : "top-1.5",
              )}
            >
              {expiry.label}
            </Badge>
          ) : null}

          <Badge
            className="absolute bottom-1.5 left-1.5 z-10 border-0 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-primary-foreground"
            style={{ backgroundColor: `${bankMeta.color}ee` }}
            data-testid="offer-bank"
          >
            {offer.bankDisplayName}
          </Badge>
        </div>

        <CardContent className="flex flex-grow flex-col p-3">
          <p className="mb-1 truncate text-sm font-bold leading-tight text-foreground" data-testid="offer-merchant">
            {offer.merchant}
          </p>
          <p className="mb-2 flex-grow text-[11px] text-muted-foreground line-clamp-1" data-testid="offer-title">
            {offer.title}
          </p>
          <div className="flex items-center justify-between gap-1">
            <Badge variant="outline" className="w-fit px-1.5 py-0 text-[9px] font-normal" data-testid="offer-category">
              {CATEGORY_LABELS[offer.category] ?? offer.category}
            </Badge>
            {offer.discountLabel ? (
              <span className="text-[10px] font-semibold text-primary" data-testid="offer-discount">
                {offer.discountLabel}
              </span>
            ) : null}
          </div>
        </CardContent>
      </a>
    </Card>
  );
}
