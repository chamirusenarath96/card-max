import { Suspense } from "react";
import { FilterBar } from "@/components/filters";
import { SearchBar } from "@/components/filters";
import { OfferGrid } from "@/components/cards";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuList,
  NavigationMenuLink,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
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
    next: { revalidate: 3600, tags: ["offers"] },
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
    <div className="min-h-screen bg-background text-foreground">
      {/* Top bar */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex w-full max-w-screen-2xl items-center justify-between px-6 py-3">
          <div className="text-xl font-bold tracking-tight">CardMax</div>
          <NavigationMenu className="hidden md:flex">
            <NavigationMenuList>
              <NavigationMenuItem>
                <NavigationMenuLink
                  href="#"
                  className={navigationMenuTriggerStyle()}
                  aria-disabled="true"
                >
                  Cards
                </NavigationMenuLink>
              </NavigationMenuItem>
              <NavigationMenuItem>
                <NavigationMenuLink
                  href="/"
                  className={navigationMenuTriggerStyle()}
                  data-active
                >
                  Offers
                </NavigationMenuLink>
              </NavigationMenuItem>
            </NavigationMenuList>
          </NavigationMenu>
          <div className="w-64">
            <Suspense fallback={<Skeleton className="h-11 w-full rounded-full" />}>
              <SearchBar initialQuery={params.q} />
            </Suspense>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <header className="relative overflow-hidden bg-muted/50 px-6 py-16 lg:py-24">
          <div className="relative z-10 mx-auto max-w-screen-xl">
            <div className="text-center lg:text-left">
              <Badge variant="secondary" className="mb-6 px-3 py-1 text-xs font-semibold uppercase tracking-wide">
                Sri Lanka&apos;s Best Deals
              </Badge>
              <h1 className="mb-6 text-4xl font-bold tracking-tight md:text-6xl lg:text-7xl">
                Explore All <span className="text-primary">Offers</span>
              </h1>
              <p className="mb-8 max-w-xl text-lg font-medium text-muted-foreground md:text-xl">
                Unlock exclusive deals and premium perks from Commercial Bank, Sampath, HNB &amp; Nations Trust Bank.
              </p>
            </div>
          </div>
          <div className="absolute top-0 right-0 h-full w-1/3 -skew-x-12 bg-primary/5" />
          <div className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
        </header>

        {/* Filters */}
        <section className="border-y border-border bg-muted/30 px-6 py-10">
          <div className="mx-auto max-w-screen-xl">
            <Suspense fallback={<Skeleton className="h-32 w-full rounded-xl" />}>
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

        {/* Grid */}
        <section className="mx-auto max-w-screen-xl px-6 py-16">
          <div className="mb-10 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-3xl font-bold tracking-tight md:text-4xl lg:text-5xl">
                {params.q
                  ? `Results for "${params.q}"`
                  : params.bank
                    ? `${BANK_LABEL[params.bank] ?? "Bank"} Offers`
                    : "All Offers"}
              </h2>
              <p className="mt-2 font-medium text-muted-foreground">
                {pagination.total} offer{pagination.total !== 1 ? "s" : ""} found
              </p>
            </div>
            <div className="hidden h-1 w-32 shrink-0 rounded-full bg-primary md:block" />
          </div>

          <OfferGrid offers={offers} pagination={pagination} />
        </section>

        {/* CTA */}
        <section className="relative overflow-hidden bg-primary px-6 py-20 text-primary-foreground">
          <div className="relative z-10 mx-auto max-w-screen-xl text-center">
            <h2 className="mb-6 text-3xl font-bold tracking-tight md:text-5xl lg:text-6xl">
              Never Miss a <span className="text-primary-foreground/90 underline decoration-primary-foreground/30 underline-offset-4">Great Deal</span>
            </h2>
            <p className="mx-auto mb-10 max-w-2xl text-lg text-primary-foreground/80">
              Browse offers from Sri Lanka&apos;s top banks, updated daily.
            </p>
          </div>
          <div className="absolute top-0 right-0 h-full w-1/3 -skew-x-12 bg-primary-foreground/5" />
        </section>
      </main>

      <footer className="border-t border-border bg-muted">
        <div className="mx-auto flex max-w-screen-2xl flex-col items-center justify-between gap-6 px-12 py-12 md:flex-row">
          <div className="flex flex-col items-center gap-2 md:items-start">
            <div className="text-lg font-bold tracking-tight">CardMax</div>
            <p className="text-center text-sm text-muted-foreground md:text-left">
              Sri Lanka&apos;s Credit Card Offers Aggregator
            </p>
          </div>
          <div className="flex gap-8 text-sm text-muted-foreground">
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
