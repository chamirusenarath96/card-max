"use client";

import type { Offer } from "../../../specs/data/offer.schema";
import { BANK_METADATA } from "../../../specs/data/offer.schema";
import { CATEGORY_LABELS, getBadgeLabel, getExpiryInfo } from "./offer-card-shared";
import { OfferImage } from "./OfferImage";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  offer: Offer;
}

export function OfferCardDefault({ offer }: Props) {
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
        <div className="relative h-44 overflow-hidden" style={{ backgroundColor: `${bankMeta.color}18` }}>
          <OfferImage
            offer={offer}
            bankColor={bankMeta.color}
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />

          {offer.discountLabel ? (
            <Badge data-testid="offer-type-badge" className="absolute top-3 right-3 z-10 text-xs font-semibold shadow">
              {badgeLabel}
            </Badge>
          ) : null}

          {expiry ? (
            <Badge
              data-testid="offer-expiry-badge"
              variant={expiry.isExpired ? "destructive" : "secondary"}
              className={cn("absolute right-3 z-10 text-[10px] font-semibold", offer.discountLabel ? "top-12" : "top-3")}
            >
              {expiry.label}
            </Badge>
          ) : null}

          <div className="absolute bottom-3 left-3 z-10 flex flex-wrap gap-2">
            <Badge
              className="border-0 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground"
              style={{ backgroundColor: `${bankMeta.color}ee` }}
              data-testid="offer-bank"
            >
              {offer.bankDisplayName}
            </Badge>
            <Badge variant="secondary" className="text-[10px] font-semibold uppercase tracking-wide" data-testid="offer-category">
              {CATEGORY_LABELS[offer.category] ?? offer.category}
            </Badge>
          </div>
        </div>

        <CardContent className="flex flex-grow flex-col p-5">
          <h3 className="mb-2 text-xl font-bold tracking-tight text-foreground" data-testid="offer-merchant">
            {offer.merchant}
          </h3>
          <p className="mb-5 flex-grow text-sm text-muted-foreground line-clamp-2" data-testid="offer-title">
            {offer.title}
          </p>
          {offer.discountLabel ? (
            <p className="mb-4 text-sm font-semibold text-primary" data-testid="offer-discount">
              {offer.discountLabel}
            </p>
          ) : null}
          {offer.validUntil ? (
            <p className="mb-4 text-xs text-muted-foreground" data-testid="offer-expiry">
              Until{" "}
              {new Date(offer.validUntil).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </p>
          ) : null}
          <div
            className={cn(
              buttonVariants({ variant: "outline" }),
              "pointer-events-none w-full justify-center text-center font-semibold",
            )}
          >
            View Offer Details
          </div>
        </CardContent>
      </a>
    </Card>
  );
}
