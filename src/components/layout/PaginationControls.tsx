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

  function getPageNumbers(): (number | "...")[] {
    const pages: (number | "...")[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push("...");
      for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
      if (page < totalPages - 2) pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  }

  return (
    <nav data-testid="pagination-controls" className="mt-16 flex items-center justify-center gap-2" aria-label="Pagination">
      <button type="button" data-testid="pagination-prev" onClick={() => goToPage(page - 1)} disabled={!hasPrev} className="w-12 h-12 rounded-xl border border-outline-variant flex items-center justify-center text-on-surface-variant hover:bg-primary hover:text-on-primary hover:border-primary transition-all disabled:opacity-30 disabled:cursor-not-allowed" aria-label="Previous page">
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
      </button>
      {getPageNumbers().map((p, i) =>
        p === "..." ? (
          <span key={`ellipsis-${i}`} className="px-2 text-on-surface-variant">...</span>
        ) : (
          <button key={p} type="button" onClick={() => goToPage(p)} className={["w-12 h-12 rounded-xl font-bold font-[family-name:var(--font-space-grotesk)] transition-all", p === page ? "bg-primary text-on-primary" : "border border-outline-variant hover:bg-primary-container"].join(" ")}>{p}</button>
        )
      )}
      <button type="button" data-testid="pagination-next" onClick={() => goToPage(page + 1)} disabled={!hasNext} className="w-12 h-12 rounded-xl border border-outline-variant flex items-center justify-center text-on-surface-variant hover:bg-primary hover:text-on-primary hover:border-primary transition-all disabled:opacity-30 disabled:cursor-not-allowed" aria-label="Next page">
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
      </button>
      <span className="sr-only">{total} offers</span>
    </nav>
  );
}
