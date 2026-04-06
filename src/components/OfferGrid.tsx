import { OfferCard } from "./OfferCard";
import type { Offer } from "../../specs/data/offer.schema";

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface Props {
  offers: Offer[];
  pagination?: Pagination;
}

export function OfferGrid({ offers, pagination }: Props) {
  if (offers.length === 0) {
    return (
      <div
        data-testid="empty-state"
        className="flex flex-col items-center justify-center py-24 text-center"
      >
        <div className="text-5xl mb-4" aria-hidden="true">
          🔍
        </div>
        <h2 className="text-xl font-semibold text-gray-800 mb-2">No offers found</h2>
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

      {pagination && pagination.totalPages > 1 && (
        <div
          data-testid="pagination"
          className="mt-8 flex justify-center"
        >
          <p className="text-sm text-gray-500">
            Page {pagination.page} of {pagination.totalPages} &mdash; {pagination.total} offers
          </p>
        </div>
      )}
    </div>
  );
}
