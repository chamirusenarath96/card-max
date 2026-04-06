import { Suspense } from "react";
import { FilterBar } from "@/components/filters";
import { SearchBar } from "@/components/filters";
import { OfferGrid, OfferCardSkeleton } from "@/components/cards";
import type { Offer } from "../../specs/data/offer.schema";
import type { Pagination } from "@/components/cards";

export const revalidate = 3600;

interface PageProps {
  searchParams: Promise<{
    bank?: string;
    category?: string;
    offerType?: string;
    activeFrom?: string;
    activeTo?: string;
    sort?: string;
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
  activeFrom?: string;
  activeTo?: string;
  sort?: string;
  q?: string;
  page?: string;
}): Promise<ApiResponse> {
  const query = new URLSearchParams();
  if (params.bank) query.set("bank", params.bank);
  if (params.category) query.set("category", params.category);
  if (params.offerType) query.set("offerType", params.offerType);
  if (params.activeFrom) query.set("activeFrom", params.activeFrom);
  if (params.activeTo) query.set("activeTo", params.activeTo);
  if (params.sort) query.set("sort", params.sort);
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

export default async function HomePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const { data: offers, pagination } = await fetchOffers(params);

  return (
    <div className="bg-background font-[family-name:var(--font-manrope)] text-on-surface min-h-screen">
      {/* TopAppBar */}
      <nav className="bg-background sticky top-0 z-50 flex justify-between items-center w-full px-6 py-4 max-w-screen-2xl mx-auto border-b border-outline-variant/10">
        <div className="text-3xl font-black italic tracking-tighter text-primary">CardMax</div>
        <div className="hidden md:flex items-center gap-8 font-[family-name:var(--font-space-grotesk)]">
          <span className="text-on-surface/60 font-medium pb-1 cursor-default">Cards</span>
          <span className="text-primary font-bold border-b-4 border-primary pb-1">Offers</span>
        </div>
        <div className="w-64">
          <Suspense fallback={<div className="h-11 rounded-full bg-surface-lowest animate-pulse" />}>
            <SearchBar initialQuery={params.q} />
          </Suspense>
        </div>
      </nav>

      <main>
        {/* Hero Header */}
        <header className="relative px-6 py-16 lg:py-24 overflow-hidden bg-surface-low">
          <div className="max-w-screen-xl mx-auto relative z-10">
            <div className="text-center lg:text-left">
              <span className="inline-block px-4 py-1.5 rounded-full bg-primary/10 text-primary font-[family-name:var(--font-space-grotesk)] font-bold text-sm tracking-wider uppercase mb-6">
                Sri Lanka&apos;s Best Deals
              </span>
              <h1 className="font-[family-name:var(--font-epilogue)] text-6xl md:text-8xl font-black tracking-tighter leading-[0.9] mb-6">
                Explore All <span className="text-gradient">Offers</span>
              </h1>
              <p className="text-on-surface-variant text-lg md:text-xl font-medium max-w-xl mb-8 leading-relaxed">
                Unlock exclusive deals and premium perks from Commercial Bank, Sampath, HNB &amp; Nations Trust Bank.
              </p>
            </div>
          </div>
          <div className="absolute top-0 right-0 w-1/3 h-full bg-primary/5 -skew-x-12" />
          <div className="absolute -top-24 -right-24 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        </header>

        {/* Filters Section */}
        <section className="px-6 py-10 bg-surface-low border-y border-outline-variant/10">
          <div className="max-w-screen-xl mx-auto">
            <Suspense fallback={<div className="h-32 bg-surface-container rounded-2xl animate-pulse" />}>
              <FilterBar
                activeBank={params.bank}
                activeCategory={params.category}
                activeOfferType={params.offerType}
                activeFrom={params.activeFrom}
                activeTo={params.activeTo}
                activeSort={params.sort}
              />
            </Suspense>
          </div>
        </section>

        {/* Offer Grid */}
        <section className="px-6 py-16 max-w-screen-xl mx-auto">
          <div className="flex items-end justify-between mb-10">
            <div>
              <h3 className="font-[family-name:var(--font-epilogue)] text-4xl md:text-5xl font-black tracking-tighter">
                {params.q
                  ? `Results for "${params.q}"`
                  : params.bank
                    ? `${BANK_LABEL[params.bank] ?? "Bank"} Offers`
                    : "All Offers"}
              </h3>
              <p className="text-on-surface-variant font-medium mt-2">
                {pagination.total} offer{pagination.total !== 1 ? "s" : ""} found
              </p>
            </div>
            <div className="hidden md:block w-32 h-1 bg-primary rounded-full" />
          </div>

          <OfferGrid offers={offers} pagination={pagination} />
        </section>

        {/* CTA Section */}
        <section className="px-6 py-20 bg-on-surface text-surface overflow-hidden relative">
          <div className="max-w-screen-xl mx-auto text-center relative z-10">
            <h2 className="font-[family-name:var(--font-epilogue)] text-4xl md:text-6xl font-black tracking-tighter mb-6 leading-tight">
              Never Miss a <span className="text-primary-container">Great Deal</span>
            </h2>
            <p className="text-lg text-surface-dim max-w-2xl mx-auto mb-10">
              Browse offers from Sri Lanka&apos;s top banks, updated daily.
            </p>
          </div>
          <div className="absolute top-0 right-0 w-1/3 h-full bg-primary/10 -skew-x-12" />
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-inverse-surface text-surface">
        <div className="flex flex-col md:flex-row justify-between items-center w-full px-12 py-12 gap-6 max-w-screen-2xl mx-auto">
          <div className="flex flex-col items-center md:items-start gap-2">
            <div className="text-2xl font-black text-white italic tracking-tighter">CardMax</div>
            <p className="font-[family-name:var(--font-space-grotesk)] text-sm text-slate-400">
              Sri Lanka&apos;s Credit Card Offers Aggregator
            </p>
          </div>
          <div className="flex gap-8 font-[family-name:var(--font-space-grotesk)] text-sm text-slate-400">
            <span>Privacy</span>
            <span>Terms</span>
            <span>Support</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

const BANK_LABEL: Record<string, string> = {
  commercial_bank: "Commercial Bank",
  sampath_bank: "Sampath Bank",
  hnb: "HNB",
  nations_trust_bank: "Nations Trust Bank",
};
