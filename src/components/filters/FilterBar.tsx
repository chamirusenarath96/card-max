"use client";

import dynamic from "next/dynamic";
import { FilterDrawerSkeleton } from "./FilterDrawerSkeleton";

const FilterDrawer = dynamic(
  () => import("./FilterDrawer").then((m) => m.FilterDrawer),
  { ssr: false, loading: () => <FilterDrawerSkeleton /> },
);

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
