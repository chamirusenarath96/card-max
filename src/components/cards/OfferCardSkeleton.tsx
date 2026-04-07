import type { CardSize } from "./offer-card-shared";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  count?: number;
  size?: CardSize;
}

export function OfferCardSkeleton({ count = 6, size = "default" }: Props) {
  if (size === "compact") {
    return (
      <div data-testid="offer-skeleton" className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {Array.from({ length: count }, (_, i) => (
          <Card key={i} className="gap-0 overflow-hidden py-0">
            <Skeleton className="h-24 rounded-none" />
            <div className="space-y-2 p-3">
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-2.5 w-full" />
              <div className="flex justify-between">
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-3 w-10" />
              </div>
            </div>
          </Card>
        ))}
      </div>
    );
  }

  if (size === "expanded") {
    return (
      <div data-testid="offer-skeleton" className="flex flex-col gap-6">
        {Array.from({ length: count }, (_, i) => (
          <Card key={i} className="gap-0 overflow-hidden py-0">
            <div className="flex flex-col md:flex-row">
              <Skeleton className="h-56 flex-shrink-0 md:h-auto md:w-80" />
              <div className="flex flex-1 flex-col space-y-3 p-6">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-11 w-40 rounded-md" />
              </div>
            </div>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div data-testid="offer-skeleton" className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <Card key={i} className="gap-0 overflow-hidden py-0">
          <Skeleton className="h-44 rounded-none" />
          <div className="flex flex-col gap-3 p-5">
            <Skeleton className="h-5 w-40" />
            <div className="space-y-1.5">
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-3/4" />
            </div>
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-full rounded-md" />
          </div>
        </Card>
      ))}
    </div>
  );
}
