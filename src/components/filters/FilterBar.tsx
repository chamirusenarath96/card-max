"use client";

import { FilterDrawer } from "./FilterDrawer";

interface Props {
  activeBank?: string;
  activeCategory?: string;
  activeOfferType?: string;
  activeFrom?: string;
  activeTo?: string;
  activeSort?: string;
  includeExpired?: boolean;
}

export function FilterBar({
  activeBank,
  activeCategory,
  activeOfferType,
  activeFrom,
  activeTo,
  activeSort,
  includeExpired,
}: Props) {
  return (
    <div data-testid="filter-bar">
      <FilterDrawer
        activeBank={activeBank}
        activeCategory={activeCategory}
        activeOfferType={activeOfferType}
        activeFrom={activeFrom}
        activeTo={activeTo}
        activeSort={activeSort}
        includeExpired={includeExpired}
      />
    </div>
  );
}
