/**
 * Skeleton shown while the offer detail page is loading.
 * Also exported as a named component for use inside page.tsx Suspense.
 */
import { Skeleton } from "@/components/ui/skeleton";

export function OfferDetailSkeleton() {
  return (
    <div className="mx-auto max-w-screen-xl px-4 py-8 md:px-6 md:py-12" data-testid="offer-detail-skeleton">
      {/* Back link */}
      <Skeleton className="mb-8 h-5 w-24 rounded-full" />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-5 lg:gap-12">
        {/* Image panel */}
        <div className="lg:col-span-2">
          <Skeleton className="aspect-[4/3] w-full rounded-2xl" />
        </div>

        {/* Details panel */}
        <div className="flex flex-col gap-4 lg:col-span-3">
          <Skeleton className="h-10 w-3/4 rounded-lg" />
          <Skeleton className="h-6 w-full rounded-lg" />
          <Skeleton className="h-6 w-4/5 rounded-lg" />
          <Skeleton className="h-14 w-48 rounded-xl" />
          <Skeleton className="h-px w-full" />
          <Skeleton className="h-5 w-40 rounded-lg" />
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="mt-4 h-12 w-48 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

export default function Loading() {
  return <OfferDetailSkeleton />;
}
