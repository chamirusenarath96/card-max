import { Suspense } from "react";
import { FilterBar } from "@/components/FilterBar";
import { SearchBar } from "@/components/SearchBar";
import { OfferGrid } from "@/components/OfferGrid";
import { OfferCardSkeleton } from "@/components/OfferCardSkeleton";
import type { Offer } from "../../specs/data/offer.schema";
import type { Pagination } from "@/components/OfferGrid";

export const revalidate = 3600;

interface PageProps {
  searchParams: Promise<{
    bank?: string;
    category?: string;
    offerType?: string;
    q?: string;
    page?: string;
  }>;
}

interface ApiResponse {
  data: Offer[];
  pagination: Pagination;
}

function getBaseUrl(): string {
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

async function fetchOffers(params: {
  bank?: string;
  category?: string;
  offerType?: string;
  q?: string;
  page?: string;
}): Promise<ApiResponse> {
  const query = new URLSearchParams();
  if (params.bank) query.set("bank", params.bank);
  if (params.category) query.set("category", params.category);
  if (params.offerType) query.set("offerType", params.offerType);
  if (params.q) query.set("q", params.q);
  if (params.page) query.set("page", params.page);
  query.set("limit", "20");

  const res = await fetch(`${getBaseUrl()}/api/offers?${query}`, {
    next: { revalidate: 3600 },
  });

  if (!res.ok) {
    return {
      data: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    };
  }

  return res.json();
}

function StatsBar({ total, activeFilters }: { total: number; activeFilters: number }) {
  return (
    <div className="flex flex-wrap items-center gap-4 text-sm" data-testid="stats-bar">
      <div className="flex items-center gap-2 text-gray-600">
        <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
        </svg>
        <span>
          <span className="font-semibold text-gray-900">{total}</span> offers available
        </span>
      </div>
      {activeFilters > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
          {activeFilters} filter{activeFilters > 1 ? "s" : ""} active
        </span>
      )}
    </div>
  );
}

export default async function HomePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const { data: offers, pagination } = await fetchOffers(params);

  const activeFilters = [params.bank, params.category, params.offerType, params.q].filter(Boolean).length;

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Dashboard Header */}
      <header className="border-b border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600">
                <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">
                  CardMax
                </h1>
                <p className="text-sm text-gray-500 hidden sm:block">
                  Sri Lanka&apos;s best credit card offers in one place
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Search + Stats row */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="w-full sm:max-w-md">
            <Suspense fallback={<div className="h-10 rounded-xl bg-gray-100 animate-pulse" />}>
              <SearchBar initialQuery={params.q} />
            </Suspense>
          </div>
          <StatsBar total={pagination.total} activeFilters={activeFilters} />
        </div>

        {/* Filters */}
        <Suspense fallback={<div className="h-20 bg-gray-100 rounded-lg animate-pulse" />}>
          <FilterBar
            activeBank={params.bank}
            activeCategory={params.category}
            activeOfferType={params.offerType}
          />
        </Suspense>

        {/* Offer Grid */}
        <Suspense fallback={<OfferCardSkeleton count={6} />}>
          <OfferGrid offers={offers} pagination={pagination} />
        </Suspense>
      </div>
    </main>
  );
}
