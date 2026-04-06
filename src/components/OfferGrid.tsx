import { OfferCard } from "./OfferCard";
import { OfferCardSkeleton } from "./OfferCardSkeleton";
import { PaginationControls } from "./PaginationControls";
import type { PaginationData } from "./PaginationControls";
import type { Offer } from "../../specs/data/offer.schema";

export type { PaginationData as Pagination };

interface Props {
  offers: Offer[];
  pagination?: PaginationData;
  isLoading?: boolean;
}

export function OfferGrid({ offers, pagination, isLoading }: Props) {
  if (isLoading) {
    return <OfferCardSkeleton count={6} />;
  }

  if (offers.length === 0) {
    return (
      <div
        data-testid="empty-state"
        className="flex flex-col items-center justify-center py-24 text-center"
      >
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
          <svg
            className="h-8 w-8 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
            />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-gray-800 mb-2">
          No offers found
        </h2>
        <p className="text-gray-500 max-w-sm">
          Try adjusting your filters or check back later for new offers.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div
        data-testid="offer-grid"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
      >
        {offers.map((offer) => (
          <OfferCard
            key={offer._id ?? `${offer.bank}-${offer.merchant}-${offer.title}`}
            offer={offer}
          />
        ))}
      </div>

      {pagination && <PaginationControls pagination={pagination} />}
    </div>
  );
}
