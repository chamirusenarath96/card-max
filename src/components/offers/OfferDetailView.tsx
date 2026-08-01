import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import type { Offer } from "../../../specs/data/offer.schema";
import { BANK_METADATA } from "../../../specs/data/offer.schema";
import { CATEGORY_LABELS, getBadgeLabel, formatValidityPeriod } from "../cards/offer-card-shared";
import { OfferImage } from "../cards/OfferImage";
import { OfferCard } from "../cards/OfferCard";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Props {
  offer: Offer;
  similarOffers: Offer[];
}

/**
 * "No expiry date" is shown whenever validUntil is missing, even if validFrom
 * is present — an open-ended offer still needs an explicit "no expiry" signal
 * rather than only showing its start date.
 */
function formatDetailValidity(validFrom?: string | Date, validUntil?: string | Date): string {
  if (validUntil) {
    return formatValidityPeriod(validFrom, validUntil) ?? "No expiry date";
  }
  const fromOnly = formatValidityPeriod(validFrom, undefined);
  return fromOnly ? `${fromOnly} · No expiry date` : "No expiry date";
}

export function OfferDetailView({ offer, similarOffers }: Props) {
  const bankMeta = BANK_METADATA[offer.bank];
  const badgeLabel = getBadgeLabel(offer.offerType, offer.discountPercentage);
  const validity = formatDetailValidity(offer.validFrom, offer.validUntil);

  return (
    <div data-testid="offer-detail" className="mx-auto max-w-screen-lg px-6 py-10">
      <Link
        href="/"
        data-testid="offer-detail-back-link"
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        Back to search
      </Link>

      <Card className="overflow-hidden rounded-2xl border border-border/50 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2">
          {/* ── Image ─────────────────────────────────────────────────── */}
          <div className="relative aspect-[4/3] bg-muted/40 md:aspect-auto">
            <OfferImage
              offer={offer}
              bankColor={bankMeta.color}
              imgClassName="object-contain p-8"
              sizes="(max-width: 768px) 100vw, 50vw"
            />
          </div>

          {/* ── Details ───────────────────────────────────────────────── */}
          <CardContent className="flex flex-col gap-3 p-6 md:p-8">
            <Badge data-testid="offer-detail-badge" className="w-fit text-xs font-bold tracking-wide">
              {badgeLabel}
            </Badge>

            <h1
              data-testid="offer-detail-merchant"
              className="text-2xl font-bold tracking-tight text-foreground md:text-3xl"
            >
              {offer.merchant}
            </h1>

            <p data-testid="offer-detail-title" className="text-sm text-muted-foreground">
              {offer.title}
            </p>

            {offer.description && (
              <p data-testid="offer-detail-description" className="text-sm text-muted-foreground">
                {offer.description}
              </p>
            )}

            <p data-testid="offer-detail-validity" className="text-sm text-muted-foreground">
              {validity}
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <Badge
                className="border-0 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-white"
                style={{ backgroundColor: bankMeta.color }}
                data-testid="offer-detail-bank"
              >
                {offer.bankDisplayName}
              </Badge>
              <Badge
                variant="secondary"
                className="text-xs font-semibold uppercase tracking-wide"
                data-testid="offer-detail-category"
              >
                {CATEGORY_LABELS[offer.category] ?? offer.category}
              </Badge>
            </div>

            <a
              href={offer.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="offer-detail-source-link"
              className="mt-2 inline-flex w-fit items-center gap-1.5 rounded-md border border-border/60 bg-muted/40 px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
            >
              View Original Offer
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          </CardContent>
        </div>
      </Card>

      {similarOffers.length > 0 && (
        <section data-testid="similar-offers-section" className="mt-12">
          <h2 className="mb-6 text-xl font-bold tracking-tight text-foreground">Similar Offers</h2>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
            {similarOffers.map((similar) => (
              <OfferCard key={similar._id} offer={similar} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
