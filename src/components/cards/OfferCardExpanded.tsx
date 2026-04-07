"use client";

import Image from "next/image";
import type { Offer } from "../../../specs/data/offer.schema";
import { BANK_METADATA } from "../../../specs/data/offer.schema";
import { CATEGORY_LABELS, getBadgeLabel, getExpiryInfo } from "./offer-card-shared";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  offer: Offer;
}

export function OfferCardExpanded({ offer }: Props) {
  const bankMeta = BANK_METADATA[offer.bank];
  const expiry = getExpiryInfo(offer.validUntil);
  const badgeLabel = getBadgeLabel(offer.offerType, offer.discountPercentage);

  return (
    <Card className="h-full gap-0 overflow-hidden py-0 shadow-sm transition-shadow hover:shadow-md">
      <a
        href={offer.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        data-testid="offer-card"
        className="flex h-full flex-col md:flex-row"
      >
        <div
          className="relative h-56 flex-shrink-0 overflow-hidden md:h-auto md:w-80"
          style={{ backgroundColor: `${bankMeta.color}18` }}
        >
          {offer.merchantLogoUrl ? (
            <Image
              src={offer.merchantLogoUrl}
              alt={offer.merchant}
              fill
              sizes="(max-width: 768px) 100vw, 320px"
              className="object-cover"
              onError={(e) => {
                const el = e.currentTarget as HTMLImageElement;
                el.style.display = "none";
                el.parentElement!.querySelector("[data-fallback]")?.removeAttribute("hidden");
              }}
            />
          ) : null}
          <div
            data-fallback=""
            className="absolute inset-0 flex w-full items-center justify-center"
            {...(offer.merchantLogoUrl ? { hidden: true } : {})}
          >
            <div
              className="flex h-24 w-24 items-center justify-center rounded-xl text-5xl font-bold text-primary-foreground"
              style={{ backgroundColor: bankMeta.color }}
            >
              {offer.merchant.charAt(0).toUpperCase()}
            </div>
          </div>

          {offer.discountLabel ? (
            <Badge data-testid="offer-type-badge" className="absolute top-4 right-4 px-3 py-1 text-sm font-semibold shadow">
              {badgeLabel}
            </Badge>
          ) : null}

          {expiry ? (
            <Badge
              data-testid="offer-expiry-badge"
              variant={expiry.isExpired ? "destructive" : "secondary"}
              className={cn("absolute right-4 px-3 py-1 text-xs font-semibold", offer.discountLabel ? "top-14" : "top-4")}
            >
              {expiry.label}
            </Badge>
          ) : null}

          <div className="absolute bottom-4 left-4 flex flex-wrap gap-2">
            <Badge
              className="border-0 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground"
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

        <CardContent className="flex flex-grow flex-col p-6">
          <h3 className="mb-3 text-2xl font-bold tracking-tight text-foreground" data-testid="offer-merchant">
            {offer.merchant}
          </h3>
          <p className="mb-4 flex-grow text-base text-muted-foreground" data-testid="offer-title">
            {offer.title}
          </p>
          {offer.description ? <p className="mb-4 text-sm text-muted-foreground">{offer.description}</p> : null}
          {offer.discountLabel ? (
            <p className="mb-4 text-base font-semibold text-primary" data-testid="offer-discount">
              {offer.discountLabel}
            </p>
          ) : null}
          <div className="mb-5 flex flex-wrap items-center gap-4">
            {offer.validFrom ? (
              <p className="text-xs text-muted-foreground">
                From{" "}
                {new Date(offer.validFrom).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </p>
            ) : null}
            {offer.validUntil ? (
              <p className="text-xs text-muted-foreground" data-testid="offer-expiry">
                Until{" "}
                {new Date(offer.validUntil).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </p>
            ) : null}
          </div>
          <div className={cn(buttonVariants({ variant: "outline" }), "inline-flex self-start font-semibold")}>
            View Card Details
          </div>
        </CardContent>
      </a>
    </Card>
  );
}
