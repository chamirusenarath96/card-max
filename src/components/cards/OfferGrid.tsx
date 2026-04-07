"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { OfferCard } from "./OfferCard";
import { OfferCardSkeleton } from "./OfferCardSkeleton";
import { CardSizeToggle } from "./CardSizeToggle";
import { PaginationControls } from "../layout/PaginationControls";
import type { PaginationData } from "../layout/PaginationControls";
import type { Offer } from "../../../specs/data/offer.schema";
import type { CardSize } from "./offer-card-shared";
import { Card, CardContent } from "@/components/ui/card";

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
      <Card data-testid="empty-state" className="border-dashed py-16 text-center shadow-none">
        <CardContent className="flex flex-col items-center gap-4 px-6">
          <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-muted">
            <Search className="h-10 w-10 text-muted-foreground" strokeWidth={1.5} stroke="currentColor" aria-hidden />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">No offers found</h2>
          <p className="max-w-sm text-muted-foreground">Try adjusting your filters or check back later for new offers.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div>
      <div className="mb-6 flex justify-end">
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

      {pagination ? <PaginationControls pagination={pagination} /> : null}
    </div>
  );
}
