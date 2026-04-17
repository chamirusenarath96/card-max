"use client";

/**
 * OfferDetail — main content component for /offers/[id]
 * Spec: specs/features/005-offer-detail.md
 *
 * Extracted as a client component so it can be unit-tested in isolation.
 * The parent page.tsx is a server component that fetches the data.
 */

import Link from "next/link";
import { ArrowLeft, ExternalLink, CalendarDays, Tag, Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { OfferImage } from "@/components/cards/OfferImage";
import { getBadgeLabel, getExpiryInfo, CATEGORY_LABELS } from "@/components/cards/offer-card-shared";
import { BANK_METADATA } from "../../../../specs/data/offer.schema";
import type { Offer } from "../../../../specs/data/offer.schema";

interface Props {
  offer: Offer;
}

export function OfferDetail({ offer }: Props) {
  const bankMeta = BANK_METADATA[offer.bank];
  const expiry = getExpiryInfo(offer.validUntil);
  const badgeLabel = getBadgeLabel(offer.offerType, offer.discountPercentage);

  return (
    <div data-testid="offer-detail" className="mx-auto max-w-screen-xl px-4 py-8 md:px-6 md:py-12">

      {/* ── Breadcrumb / back link ────────────────────────────────────────── */}
      <Link
        href="/"
        data-testid="back-to-all-offers"
        className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All Offers
      </Link>

      {/* ── Main layout: image (left) + details (right) ───────────────────── */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-5 lg:gap-12">

        {/* ── Image panel ───────────────────────────────────────────────────── */}
        <div className="lg:col-span-2">
          <div
            data-testid="offer-detail-image"
            className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-border/50 shadow-md"
            style={{ backgroundColor: `${bankMeta.color}18` }}
          >
            <OfferImage
              offer={offer}
              bankColor={bankMeta.color}
              sizes="(max-width: 1024px) 100vw, 40vw"
            />

            {/* Discount badge */}
            {offer.discountLabel && (
              <Badge
                data-testid="offer-type-badge"
                className="absolute top-4 right-4 z-10 px-3 py-1.5 text-sm font-bold shadow-lg"
              >
                {badgeLabel}
              </Badge>
            )}

            {/* Expiry badge */}
            {expiry && (
              <Badge
                data-testid="offer-expiry-badge"
                variant={expiry.isExpired ? "destructive" : "secondary"}
                className="absolute right-4 z-10 px-3 py-1 text-xs font-semibold shadow"
                style={{ top: offer.discountLabel ? "4.5rem" : "1rem" }}
              >
                {expiry.label}
              </Badge>
            )}

            {/* Bank + category chips at bottom */}
            <div className="absolute bottom-4 left-4 z-10 flex flex-wrap gap-2">
              <Badge
                data-testid="offer-bank"
                className="border-0 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-primary-foreground shadow"
                style={{ backgroundColor: `${bankMeta.color}ee` }}
              >
                {offer.bankDisplayName}
              </Badge>
              <Badge
                data-testid="offer-category"
                variant="secondary"
                className="text-xs font-semibold uppercase tracking-wide shadow"
              >
                {CATEGORY_LABELS[offer.category] ?? offer.category}
              </Badge>
            </div>
          </div>
        </div>

        {/* ── Details panel ─────────────────────────────────────────────────── */}
        <div className="flex flex-col lg:col-span-3">

          {/* Merchant + title */}
          <h1
            data-testid="offer-merchant"
            className="mb-2 text-3xl font-bold tracking-tight text-foreground md:text-4xl"
          >
            {offer.merchant}
          </h1>
          <p
            data-testid="offer-title"
            className="mb-5 text-base text-muted-foreground md:text-lg"
          >
            {offer.title}
          </p>

          {/* Discount label — prominent */}
          {offer.discountLabel && (
            <p
              data-testid="offer-discount"
              className="mb-6 inline-block rounded-xl bg-primary/10 px-5 py-3 text-2xl font-extrabold text-primary"
            >
              {offer.discountLabel}
            </p>
          )}

          <Separator className="mb-6" />

          {/* Meta row: bank, category */}
          <div className="mb-5 flex flex-wrap gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Building2 className="size-4 shrink-0" aria-hidden />
              <span data-testid="offer-bank-label">{offer.bankDisplayName}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Tag className="size-4 shrink-0" aria-hidden />
              <span data-testid="offer-category-label">
                {CATEGORY_LABELS[offer.category] ?? offer.category}
              </span>
            </div>
          </div>

          {/* Validity dates */}
          {(offer.validFrom || offer.validUntil) && (
            <div
              data-testid="offer-validity"
              className="mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-muted/40 px-4 py-3 text-sm"
            >
              <CalendarDays className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              {offer.validFrom && (
                <span>
                  From{" "}
                  <span className="font-medium text-foreground">
                    {new Date(offer.validFrom).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </span>
                </span>
              )}
              {offer.validFrom && offer.validUntil && (
                <span className="text-muted-foreground">·</span>
              )}
              {offer.validUntil && (
                <span data-testid="offer-expiry">
                  Until{" "}
                  <span className="font-medium text-foreground">
                    {new Date(offer.validUntil).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </span>
                  {expiry && (
                    <span
                      className={`ml-2 font-semibold ${expiry.isExpired ? "text-destructive" : "text-amber-600 dark:text-amber-400"}`}
                    >
                      ({expiry.label})
                    </span>
                  )}
                </span>
              )}
            </div>
          )}

          {/* Description */}
          {offer.description && (
            <>
              <p
                data-testid="offer-description"
                className="mb-6 text-sm leading-relaxed text-muted-foreground"
              >
                {offer.description}
              </p>
              <Separator className="mb-6" />
            </>
          )}

          {/* CTA */}
          <div className="mt-auto flex flex-col gap-3 sm:flex-row">
            <Button
              asChild
              size="lg"
              className="gap-2 font-semibold"
              data-testid="view-original-offer"
            >
              <a href={offer.sourceUrl} target="_blank" rel="noopener noreferrer">
                View Original Offer
                <ExternalLink className="size-4" aria-hidden />
              </a>
            </Button>

            <Button asChild variant="outline" size="lg">
              <Link href="/">
                <ArrowLeft className="size-4" aria-hidden />
                All Offers
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
