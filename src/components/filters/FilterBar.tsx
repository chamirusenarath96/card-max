"use client";

import dynamic from "next/dynamic";
import { FilterDrawerSkeleton } from "./FilterDrawerSkeleton";

const FilterDrawer = dynamic(
  () => import("./FilterDrawer").then((m) => m.FilterDrawer),
  { ssr: false, loading: () => <FilterDrawerSkeleton /> },
);

interface Props {
  activeBanks?: string[];
  activeCategories?: string[];
  activeOfferTypes?: string[];
  activeFrom?: string;
  activeTo?: string;
  activeSort?: string;
  includeExpired?: boolean;
}

export function FilterBar({
  activeBanks,
  activeCategories,
  activeOfferTypes,
  activeFrom,
  activeTo,
  activeSort,
  includeExpired,
}: Props) {
  return (
    <div data-testid="filter-bar">
      <FilterDrawer
        activeBanks={activeBanks}
        activeCategories={activeCategories}
        activeOfferTypes={activeOfferTypes}
        activeFrom={activeFrom}
        activeTo={activeTo}
        activeSort={activeSort}
        includeExpired={includeExpired}
      />
    </div>
  );
}
