import { Suspense, cache } from "react";
import { FilterBar } from "@/components/filters";
import { OfferGrid } from "@/components/cards";
import { HeroSearch } from "@/components/search/HeroSearch";
import { AdUnit } from "@/components/ads/AdUnit";
import { ScrollControls } from "@/components/layout/ScrollControls";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuList,
  NavigationMenuLink,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { LoadTimeBadge } from "@/components/layout/LoadTimeBadge";
import { SearchDrawerDynamic } from "@/components/search/SearchDrawerDynamic";
import { Footer } from "@/components/layout/Footer";
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
    includeExpired?: string;
  }>;
}

interface ApiResponse {
  data: Offer[];
  pagination: Pagination;
}

type SearchParams = {
  bank?: string;
  category?: string;
  offerType?: string;
  activeFrom?: string;
  activeTo?: string;
  sort?: string;
  q?: string;
  page?: string;
  includeExpired?: string;
};

function getBaseUrl(): string {
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL)
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

// cache() deduplicates this call when OfferCount and OfferGridContent both invoke it
const fetchOffers = cache(async (params: SearchParams): Promise<ApiResponse> => {
  const query = new URLSearchParams();
  if (params.bank) query.set("bank", params.bank);
  if (params.category) query.set("category", params.category);
  if (params.offerType) query.set("offerType", params.offerType);
  if (params.activeFrom) query.set("activeFrom", params.activeFrom);
  if (params.activeTo) query.set("activeTo", params.activeTo);
  if (params.sort) query.set("sort", params.sort);
  if (params.q) query.set("q", params.q);
  if (params.page) query.set("page", params.page);
  if (params.includeExpired) query.set("includeExpired", params.includeExpired);
  query.set("limit", "20");

  const res = await fetch(`${getBaseUrl()}/api/offers?${query}`, {
    cache: "no-store",
  });

  if (!res.ok) {
    return { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } };
  }

  return res.json();
});

const BANK_LABEL: Record<string, string> = {
  commercial_bank: "Commercial Bank",
  sampath_bank: "Sampath Bank",
  hnb: "HNB",
  nations_trust_bank: "Nations Trust Bank",
  amex_ntb: "American Express",
  bank_of_ceylon: "Bank of Ceylon",
};

function GridOnlySkeleton() {
  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-48 rounded-2xl" />
      ))}
    </div>
  );
}

async function OfferCount({ params }: { params: SearchParams }) {
  const { pagination } = await fetchOffers(params);
  return (
    <p className="mt-1.5 flex items-center gap-2 text-sm font-medium text-muted-foreground">
      {pagination.total !== undefined
        ? `${pagination.total} offer${pagination.total !== 1 ? "s" : ""} found`
        : "Browsing offers"}
      <LoadTimeBadge />
    </p>
  );
}

async function OfferGridContent({ params }: { params: SearchParams }) {
  const { data: offers, pagination } = await fetchOffers(params);
  return (
    <div data-testid="offer-grid-section">
      <OfferGrid offers={offers} pagination={pagination} />
    </div>
  );
}

export default async function HomePage({ searchParams }: PageProps) {
  const params = await searchParams;

  const hasActiveFilters =
    params.bank || params.category || params.offerType ||
    params.activeFrom || params.activeTo ||
    params.includeExpired === "true" ||
    (params.sort && params.sort !== "latest");

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── Header ───────────────────────────────────────────────────────── */}
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

          <div className="flex items-center gap-2">
            <SearchDrawerDynamic />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main>
        {/* ── Hero: search + suggestions ───────────────────────────────── */}
        <section
          className="relative bg-background px-6 py-20 lg:py-28"
          data-testid="hero-section"
        >
          {/* Radial glow */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,hsl(var(--primary)/12%),transparent)]"
          />

          <div className="relative mx-auto max-w-4xl text-center">
            <Badge
              variant="secondary"
              className="mb-6 px-3 py-1 text-xs font-semibold uppercase tracking-wide"
            >
              Sri Lanka&apos;s Credit Card Offers
            </Badge>

            <h1 className="mb-5 text-5xl font-bold tracking-tight md:text-6xl lg:text-7xl">
              Find the Best{" "}
              <span className="text-primary">Card Deals</span>
            </h1>

            <p className="mx-auto mb-10 max-w-2xl text-lg text-muted-foreground">
              Exclusive offers from Commercial Bank, Sampath, HNB &amp; Nations
              Trust Bank — updated daily.
            </p>

            <Suspense
              fallback={
                <div className="flex flex-col items-center gap-4">
                  <Skeleton className="h-14 w-full max-w-2xl rounded-full" />
                  <div className="flex gap-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <Skeleton key={i} className="h-9 w-20 rounded-full" />
                    ))}
                  </div>
                </div>
              }
            >
              <HeroSearch initialQuery={params.q} />
            </Suspense>
          </div>
        </section>

        {/* ── Offer grid ───────────────────────────────────────────────── */}
        <section className="mx-auto max-w-screen-xl px-6 py-8 xl:flex xl:gap-8">
          <div className="min-w-0 flex-1">
            {/*
             * filter-section renders without a DB dependency so the FilterBar
             * client component (and its FilterDrawer dynamic chunk) can start
             * loading at hydration time — well before the offers fetch returns.
             * This keeps the drawer-open interaction within the 500 ms budget
             * tested in interaction-timing.spec.ts.
             */}
            <div
              className="mb-8 flex flex-wrap items-center justify-between gap-4"
              data-testid="filter-section"
            >
              <div>
                <h2 className="text-2xl font-bold tracking-tight md:text-3xl lg:text-4xl">
                  {params.q
                    ? `Results for "${params.q}"`
                    : params.bank
                      ? `${BANK_LABEL[params.bank] ?? "Bank"} Offers`
                      : hasActiveFilters
                        ? "Filtered Offers"
                        : "All Offers"}
                </h2>
                <Suspense fallback={<Skeleton className="mt-1.5 h-5 w-32 rounded" />}>
                  <OfferCount params={params} />
                </Suspense>
              </div>

              <Suspense fallback={<Skeleton className="h-11 w-40 rounded-lg" />}>
                <FilterBar
                  activeBank={params.bank}
                  activeCategory={params.category}
                  activeOfferType={params.offerType}
                  activeFrom={params.activeFrom}
                  activeTo={params.activeTo}
                  activeSort={params.sort}
                  includeExpired={params.includeExpired === "true"}
                />
              </Suspense>
            </div>

            <Suspense fallback={<GridOnlySkeleton />}>
              <OfferGridContent params={params} />
            </Suspense>
          </div>

          {/* Sidebar ad — desktop only (≥ 1280px) */}
          {process.env.NEXT_PUBLIC_ADSENSE_ENABLED === "true" && (
            <aside
              data-testid="sidebar-ad"
              className="hidden min-h-[250px] w-[300px] shrink-0 xl:block"
            >
              <AdUnit
                slotId={process.env.NEXT_PUBLIC_ADSENSE_SLOT_SIDEBAR ?? ""}
                format="rectangle"
                className="sticky top-24 min-h-[250px]"
              />
            </aside>
          )}
        </section>

        {/* ── CTA ──────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden bg-primary px-6 py-20 text-primary-foreground">
          <div className="relative z-10 mx-auto max-w-screen-xl text-center">
            <h2 className="mb-4 text-3xl font-bold tracking-tight md:text-5xl">
              Never Miss a{" "}
              <span className="underline decoration-primary-foreground/30 underline-offset-4">
                Great Deal
              </span>
            </h2>
            <p className="mx-auto max-w-xl text-lg text-primary-foreground/80">
              Browse offers from Sri Lanka&apos;s top banks, updated daily.
            </p>
          </div>
          <div aria-hidden className="absolute top-0 right-0 h-full w-1/3 -skew-x-12 bg-primary-foreground/5" />
        </section>
      </main>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <Footer />

      {/* ── Floating scroll controls ──────────────────────────────────────── */}
      <ScrollControls />
    </div>
  );
}
