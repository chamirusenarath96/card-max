interface Props {
  count?: number;
}

export function OfferCardSkeleton({ count = 6 }: Props) {
  return (
    <div
      data-testid="offer-skeleton"
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
    >
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="flex flex-col rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden animate-pulse"
        >
          <div className="h-1.5 bg-gray-200" />
          <div className="p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="h-3 w-24 rounded bg-gray-200" />
              <div className="h-5 w-16 rounded-full bg-gray-200" />
            </div>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-gray-200 flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-32 rounded bg-gray-200" />
                <div className="h-3 w-20 rounded bg-gray-200" />
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="h-3 w-full rounded bg-gray-200" />
              <div className="h-3 w-3/4 rounded bg-gray-200" />
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-gray-100">
              <div className="h-5 w-16 rounded-full bg-gray-200" />
              <div className="h-3 w-24 rounded bg-gray-200" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
