import { Skeleton } from "@/components/ui/skeleton";

export function FilterDrawerSkeleton() {
  return (
    <Skeleton
      data-testid="filter-drawer-skeleton"
      className="h-11 w-32 rounded-lg"
    />
  );
}
