import { Suspense } from "react";
import { FilterBar } from "@/components/filters";
import { OfferGrid } from "@/components/cards";
import { HeroSearch } from "@/components/search/HeroSearch";
import { SearchDrawer } from "@/components/search/SearchDrawer";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL)
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
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
    cache: "no-store",
  });

  if (!res.ok) {
    return { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } };
  }

  return res.json();
}

const BANK_LABEL: Record<string, string> = {
  commercial_bank: "Commercial Bank",
  sampath_bank: "Sampath Bank",
  hnb: "HNB",
  nations_trust_bank: "Nations Trust Bank",
};

export default async function HomePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const { data: offers, pagination } = await fetchOffers(params);

  const hasActiveFilters =
    params.bank || params.category || params.offerType ||
    params.activeFrom || params.activeTo ||
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

          {/* Search drawer trigger — Ctrl+S shortcut */}
          <Suspense fallback={<Skeleton className="h-9 w-32 rounded-full" />}>
            <SearchDrawer initialQuery={params.q} />
          </Suspense>
        </div>
      </header>

      <main>
        {/* ── Hero: search + suggestions ───────────────────────────────── */}
        <section
          className="relative overflow-hidden bg-background px-6 py-20 lg:py-28"
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

        <Separator />

        {/* ── Filters ──────────────────────────────────────────────────── */}
        <section
          className="sticky top-[57px] z-40 border-b border-border bg-background/95 px-6 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80"
          data-testid="filter-section"
        >
          <div className="mx-auto max-w-screen-xl">
            <Suspense fallback={<Skeleton className="h-11 w-40 rounded-lg" />}>
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

        {/* ── Offer grid ───────────────────────────────────────────────── */}
        <section className="mx-auto max-w-screen-xl px-6 py-14">
          <div className="mb-8 flex items-end justify-between gap-4">
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
              <p className="mt-1.5 text-sm font-medium text-muted-foreground">
                {pagination.total !== undefined
                  ? `${pagination.total} offer${pagination.total !== 1 ? "s" : ""} found`
                  : "Browsing offers"}
              </p>
            </div>
            <div className="hidden h-1 w-24 shrink-0 rounded-full bg-primary md:block" />
          </div>

          <OfferGrid offers={offers} pagination={pagination} />
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
      <footer className="border-t border-border bg-muted">
        <div className="mx-auto flex max-w-screen-2xl flex-col items-center justify-between gap-6 px-12 py-12 md:flex-row">
          <div className="flex flex-col items-center gap-1 md:items-start">
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
