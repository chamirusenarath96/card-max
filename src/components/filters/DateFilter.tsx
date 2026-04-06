"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

interface Props {
  activeFrom?: string;
  activeTo?: string;
}

export function DateFilter({ activeFrom, activeTo }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setDateParams(from: string | null, to: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (from) params.set("activeFrom", from); else params.delete("activeFrom");
    if (to) params.set("activeTo", to); else params.delete("activeTo");
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function handleFromChange(e: React.ChangeEvent<HTMLInputElement>) {
    setDateParams(e.target.value || null, activeTo ?? null);
  }

  function handleToChange(e: React.ChangeEvent<HTMLInputElement>) {
    setDateParams(activeFrom ?? null, e.target.value || null);
  }

  function handleClear() {
    setDateParams(null, null);
  }

  const hasDateFilter = !!activeFrom || !!activeTo;

  return (
    <div data-testid="date-filter">
      <h2 className="font-[family-name:var(--font-space-grotesk)] text-sm uppercase tracking-widest text-primary font-bold mb-4">
        Date Filter
      </h2>

      {/* Airline-style connected range picker */}
      <div className="inline-flex items-stretch bg-surface-lowest rounded-xl shadow-sm overflow-hidden">
        {/* From section */}
        <div className="flex items-center gap-2 px-4 py-3">
          <svg
            className="h-4 w-4 text-primary flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
            />
          </svg>
          <div className="flex flex-col">
            <span className="text-[9px] uppercase tracking-widest text-on-surface-variant font-bold font-[family-name:var(--font-space-grotesk)]">
              From
            </span>
            <label htmlFor="date-from" className="sr-only">Valid from</label>
            <input
              id="date-from"
              type="date"
              data-testid="date-from"
              value={activeFrom ?? ""}
              onChange={handleFromChange}
              className="bg-transparent text-sm font-[family-name:var(--font-space-grotesk)] font-bold text-on-surface focus:outline-none w-[130px]"
            />
          </div>
        </div>

        {/* Divider */}
        <div className="w-px bg-outline-variant/30 self-stretch my-2" />

        {/* To section */}
        <div className="flex items-center gap-2 px-4 py-3">
          <svg
            className="h-4 w-4 text-primary flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
            />
          </svg>
          <div className="flex flex-col">
            <span className="text-[9px] uppercase tracking-widest text-on-surface-variant font-bold font-[family-name:var(--font-space-grotesk)]">
              To
            </span>
            <label htmlFor="date-to" className="sr-only">Valid until</label>
            <input
              id="date-to"
              type="date"
              data-testid="date-to"
              value={activeTo ?? ""}
              onChange={handleToChange}
              min={activeFrom ?? undefined}
              className="bg-transparent text-sm font-[family-name:var(--font-space-grotesk)] font-bold text-on-surface focus:outline-none w-[130px]"
            />
          </div>
        </div>

        {/* Clear button inside the picker */}
        {hasDateFilter && (
          <>
            <div className="w-px bg-outline-variant/30 self-stretch my-2" />
            <button
              type="button"
              data-testid="date-clear"
              onClick={handleClear}
              className="px-3 flex items-center text-on-surface-variant hover:text-error transition-colors"
              aria-label="Clear dates"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
