"use client";

import { useState } from "react";
import { OfferCard } from "./OfferCard";
import { OfferCardSkeleton } from "./OfferCardSkeleton";
import { CardSizeToggle } from "./CardSizeToggle";
import { PaginationControls } from "../layout/PaginationControls";
import type { PaginationData } from "../layout/PaginationControls";
import type { Offer } from "../../../specs/data/offer.schema";
import type { CardSize } from "./offer-card-shared";

export type { PaginationData as Pagination };

interface Props {
  offers: Offer[];
  pagination?: PaginationData;
  isLoading?: boolean;
}

const GRID_CLASS: Record<CardSize, string> = {
  compact: "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4",
  default: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8",
  expanded: "flex flex-col gap-6",
};

export function OfferGrid({ offers, pagination, isLoading }: Props) {
  const [cardSize, setCardSize] = useState<CardSize>("default");

  if (isLoading) {
    return <OfferCardSkeleton count={6} size={cardSize} />;
  }

  if (offers.length === 0) {
    return (
      <div data-testid="empty-state" className="flex flex-col items-center justify-center py-24 text-center">
        <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-surface-container">
          <svg className="h-10 w-10 text-on-surface-variant" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
        </div>
        <h2 className="text-2xl font-black text-on-surface mb-2 font-[family-name:var(--font-epilogue)]">No offers found</h2>
        <p className="text-on-surface-variant max-w-sm">Try adjusting your filters or check back later for new offers.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Size toggle */}
      <div className="flex justify-end mb-6">
        <CardSizeToggle size={cardSize} onChange={setCardSize} />
      </div>

      <div data-testid="offer-grid" className={GRID_CLASS[cardSize]}>
        {offers.map((offer) => (
          <OfferCard
            key={offer._id ?? `${offer.bank}-${offer.merchant}-${offer.title}`}
            offer={offer}
            size={cardSize}
          />
        ))}
      </div>

      {pagination && <PaginationControls pagination={pagination} />}
    </div>
  );
}
