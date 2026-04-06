import type { CardSize } from "./offer-card-shared";

interface Props {
  count?: number;
  size?: CardSize;
}

export function OfferCardSkeleton({ count = 6, size = "default" }: Props) {
  if (size === "compact") {
    return (
      <div data-testid="offer-skeleton" className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="glass p-[2px] rounded-xl">
            <div className="bg-surface-lowest rounded-xl overflow-hidden animate-pulse">
              <div className="h-24 bg-surface-container" />
              <div className="p-3 space-y-2">
                <div className="h-3.5 w-20 rounded bg-surface-container" />
                <div className="h-2.5 w-full rounded bg-surface-container" />
                <div className="flex justify-between">
                  <div className="h-3 w-12 rounded bg-surface-container" />
                  <div className="h-3 w-10 rounded bg-surface-container" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (size === "expanded") {
    return (
      <div data-testid="offer-skeleton" className="flex flex-col gap-6">
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="glass p-[3px] rounded-2xl">
            <div className="bg-surface-lowest rounded-2xl overflow-hidden flex flex-col md:flex-row animate-pulse">
              <div className="h-56 md:h-auto md:w-80 bg-surface-container flex-shrink-0" />
              <div className="p-6 flex-1 space-y-3">
                <div className="h-6 w-48 rounded bg-surface-container" />
                <div className="h-4 w-full rounded bg-surface-container" />
                <div className="h-4 w-3/4 rounded bg-surface-container" />
                <div className="h-4 w-28 rounded bg-surface-container" />
                <div className="h-11 w-40 rounded-xl bg-surface-container" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div data-testid="offer-skeleton" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="glass p-[3px] rounded-2xl">
          <div className="bg-surface-lowest rounded-2xl overflow-hidden animate-pulse">
            <div className="h-44 bg-surface-container" />
            <div className="p-5 flex flex-col gap-3">
              <div className="h-5 w-40 rounded bg-surface-container" />
              <div className="space-y-1.5">
                <div className="h-3.5 w-full rounded bg-surface-container" />
                <div className="h-3.5 w-3/4 rounded bg-surface-container" />
              </div>
              <div className="h-4 w-24 rounded bg-surface-container" />
              <div className="h-10 w-full rounded-xl bg-surface-container" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
