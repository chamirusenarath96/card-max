import { Skeleton } from "@/components/ui/skeleton";

export default function OfferDetailLoading() {
  return (
    <div data-testid="offer-detail-loading" className="mx-auto max-w-screen-lg px-6 py-10">
      <Skeleton className="mb-6 h-5 w-32" />
      <div className="grid grid-cols-1 gap-0 overflow-hidden rounded-2xl border border-border/50 md:grid-cols-2">
        <Skeleton className="aspect-[4/3] rounded-none md:aspect-auto" />
        <div className="flex flex-col gap-3 p-6 md:p-8">
          <Skeleton className="h-5 w-24 rounded-full" />
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-9 w-40 rounded-md" />
        </div>
      </div>
    </div>
  );
}
