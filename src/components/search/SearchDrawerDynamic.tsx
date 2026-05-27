"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

const SearchDrawerLazy = dynamic(
  () => import("./SearchDrawer").then((m) => m.SearchDrawer),
  { ssr: false, loading: () => <Skeleton data-testid="search-drawer-skeleton" className="h-9 w-28 rounded-full" /> },
);

export function SearchDrawerDynamic() {
  return <SearchDrawerLazy />;
}
