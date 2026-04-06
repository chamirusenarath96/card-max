"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

export interface PaginationData {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface Props {
  pagination: PaginationData;
}

export function PaginationControls({ pagination }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (pagination.totalPages <= 1) return null;

  function goToPage(page: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (page <= 1) {
      params.delete("page");
    } else {
      params.set("page", String(page));
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  const { page, totalPages, total } = pagination;
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  return (
    <nav
      data-testid="pagination-controls"
      className="mt-8 flex items-center justify-between gap-4"
      aria-label="Pagination"
    >
      <p className="text-sm text-gray-500">
        Page <span className="font-medium text-gray-700">{page}</span> of{" "}
        <span className="font-medium text-gray-700">{totalPages}</span>
        <span className="hidden sm:inline"> — {total} offers</span>
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          data-testid="pagination-prev"
          onClick={() => goToPage(page - 1)}
          disabled={!hasPrev}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Prev
        </button>
        <button
          type="button"
          data-testid="pagination-next"
          onClick={() => goToPage(page + 1)}
          disabled={!hasNext}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>
    </nav>
  );
}
