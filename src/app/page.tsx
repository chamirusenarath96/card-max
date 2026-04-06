import { Suspense } from "react";
import { FilterBar } from "@/components/FilterBar";
import { OfferGrid } from "@/components/OfferGrid";
import type { Offer } from "../../specs/data/offer.schema";
import type { Pagination } from "@/components/OfferGrid";

// Revalidate every hour (ISR)
export const revalidate = 3600;

interface PageProps {
  searchParams: Promise<{
    bank?: string;
    category?: string;
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
  page?: string;
}): Promise<ApiResponse> {
  const query = new URLSearchParams();
  if (params.bank) query.set("bank", params.bank);
  if (params.category) query.set("category", params.category);
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

export default async function HomePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const { data: offers, pagination } = await fetchOffers(params);

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <h1 className="text-2xl font-bold text-gray-900">
            Sri Lanka Credit Card Offers
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Best credit card deals from Commercial Bank, Sampath, HNB &amp;
            Nations Trust Bank
          </p>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* FilterBar is a client component — wrap in Suspense for useSearchParams */}
        <Suspense fallback={<div className="mb-6 h-16 bg-gray-100 rounded-lg animate-pulse" />}>
          <FilterBar activeBank={params.bank} activeCategory={params.category} />
        </Suspense>

        <OfferGrid offers={offers} pagination={pagination} />
      </div>
    </main>
  );
}
