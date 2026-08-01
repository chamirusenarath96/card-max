"use client";

import { useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { SlidersHorizontal, X, Check } from "lucide-react";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { BANK_METADATA } from "../../../specs/data/offer.schema";
import type { Bank } from "../../../specs/data/offer.schema";
import { AdUnit } from "@/components/ads/AdUnit";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useCategories } from "@/hooks/useCategories";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useNavigationProgress } from "@/components/layout/NavigationProgressContext";

/** Stable section ids, in rendering order — Date Range must stay last. */
const FILTER_SECTIONS = [
  "sort",
  "bank",
  "category",
  "offerType",
  "includeExpired",
  "dateRange",
] as const;

const BANKS = Object.entries(BANK_METADATA) as [Bank, (typeof BANK_METADATA)[Bank]][];

const OFFER_TYPES: { value: string; label: string }[] = [
  { value: "percentage", label: "% Discount" },
  { value: "cashback", label: "Cashback" },
  { value: "bogo", label: "Buy 1 Get 1" },
  { value: "installment", label: "Installment Plans" },
  { value: "fixed_amount", label: "Fixed Amount Off" },
  { value: "points", label: "Points / Miles" },
  { value: "free_item", label: "Free Items" },
  { value: "other", label: "Other" },
];

interface Props {
  activeBanks?: string[];
  activeCategories?: string[];
  activeOfferTypes?: string[];
  activeFrom?: string;
  activeTo?: string;
  activeSort?: string;
  includeExpired?: boolean;
}

function toDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return isNaN(d.getTime()) ? undefined : d;
}

function toISODate(date: Date | undefined): string | null {
  if (!date) return null;
  return format(date, "yyyy-MM-dd");
}

/** Toggle a value in/out of an array. */
function toggle(arr: string[], val: string): string[] {
  return arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];
}

export function FilterDrawer({
  activeBanks = [],
  activeCategories = [],
  activeOfferTypes = [],
  activeFrom,
  activeTo,
  activeSort,
  includeExpired,
}: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { navigate } = useNavigationProgress();
  const { data: categories, isLoading: categoriesLoading } = useCategories();

  // Below the `sm` breakpoint (640px) the drawer becomes a full-page takeover
  // and sections default to collapsed; at `sm` and above it keeps today's panel.
  const isDesktop = useMediaQuery("(min-width: 640px)");

  // ── Controlled drawer open state ──────────────────────────────────────────
  const [open, setOpen] = useState(false);

  // ── Accordion section expand/collapse state ───────────────────────────────
  const [openSections, setOpenSections] = useState<string[]>([...FILTER_SECTIONS]);

  // ── Pending filter state — updated locally, applied on "Apply Filters" ───
  const [pendingBanks,      setPendingBanks]      = useState<string[]>([]);
  const [pendingCategories, setPendingCategories] = useState<string[]>([]);
  const [pendingOfferTypes, setPendingOfferTypes] = useState<string[]>([]);
  const [pendingSort, setPendingSort] = useState<string>("latest");
  const [pendingIncludeExpired, setPendingIncludeExpired] = useState<boolean>(false);
  const [pendingDateRange, setPendingDateRange] = useState<DateRange | undefined>(undefined);

  /**
   * Sync pending state from URL params when the drawer opens.
   * Uses searchParams.getAll() so multi-value params are read correctly.
   */
  function syncPendingFromUrl() {
    setPendingBanks(searchParams.getAll("bank"));
    setPendingCategories(searchParams.getAll("category"));
    setPendingOfferTypes(searchParams.getAll("offerType"));
    setPendingSort(activeSort ?? "latest");
    setPendingIncludeExpired(includeExpired ?? false);
    const from = toDate(activeFrom);
    const to = toDate(activeTo);
    setPendingDateRange(from || to ? { from, to } : undefined);
  }

  function handleOpenChange(isOpen: boolean) {
    if (isOpen) {
      syncPendingFromUrl();
      // Sections default open on desktop, collapsed on mobile — reset each open.
      setOpenSections(isDesktop ? [...FILTER_SECTIONS] : []);
    }
    setOpen(isOpen);
  }

  // ── Active count (reflects applied URL state, shown on trigger badge) ────
  const activeCount =
    activeBanks.length +
    activeCategories.length +
    activeOfferTypes.length +
    [
      activeFrom,
      activeTo,
      activeSort && activeSort !== "latest" ? activeSort : null,
      includeExpired ? "expired" : null,
    ].filter(Boolean).length;

  // ── Pending count (reflects changes not yet applied) ─────────────────────
  const pendingCount =
    pendingBanks.length +
    pendingCategories.length +
    pendingOfferTypes.length +
    [
      pendingDateRange?.from ? toISODate(pendingDateRange.from) : null,
      pendingDateRange?.to ? toISODate(pendingDateRange.to) : null,
      pendingSort !== "latest" ? pendingSort : null,
      pendingIncludeExpired ? "expired" : null,
    ].filter(Boolean).length;

  // ── Apply all pending state to URL (single router.push call) ─────────────
  function applyFilters() {
    const params = new URLSearchParams(searchParams.toString());

    // Multi-value params: delete all existing values then append each selection.
    params.delete("bank");
    pendingBanks.forEach((b) => params.append("bank", b));

    params.delete("category");
    pendingCategories.forEach((c) => params.append("category", c));

    params.delete("offerType");
    pendingOfferTypes.forEach((t) => params.append("offerType", t));

    if (pendingSort !== "latest") params.set("sort", pendingSort); else params.delete("sort");
    if (pendingIncludeExpired) params.set("includeExpired", "true"); else params.delete("includeExpired");

    const from = toISODate(pendingDateRange?.from);
    const to = toISODate(pendingDateRange?.to);
    if (from) params.set("activeFrom", from); else params.delete("activeFrom");
    if (to) params.set("activeTo", to); else params.delete("activeTo");

    params.delete("page");
    // Applying filters starts a new search intent — clear any freetext query
    // so filter results are not unexpectedly constrained by a previous search.
    params.delete("q");

    // Close drawer optimistically, then navigate (one DB call for all changes).
    setOpen(false);
    const qs = params.toString();
    navigate(qs ? `${pathname}?${qs}` : pathname);
  }

  // ── Clear all filters (immediate — no Apply needed) ───────────────────────
  function clearAll() {
    setPendingBanks([]);
    setPendingCategories([]);
    setPendingOfferTypes([]);
    setPendingSort("latest");
    setPendingIncludeExpired(false);
    setPendingDateRange(undefined);
    setOpen(false);
    navigate(pathname);
  }

  const fromDate = pendingDateRange?.from;
  const toDate_ = pendingDateRange?.to;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          data-testid="filter-drawer-trigger"
          className={cn(
            "relative h-auto min-h-11 gap-2 rounded-lg px-5 py-2.5 font-medium",
            // Glow animation only when no filters are active — attracts first-time users
            activeCount === 0 && "animate-filter-glow",
          )}
          aria-label={`Open filters${activeCount > 0 ? `, ${activeCount} active` : ""}`}
        >
          <SlidersHorizontal className="size-4" aria-hidden />
          Filters
          {activeCount > 0 && (
            <Badge
              variant="default"
              className="absolute -top-2 -right-2 flex size-5 items-center justify-center rounded-full p-0 text-[10px] leading-none"
            >
              {activeCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>

      <SheetContent
        side="right"
        data-testid="filter-drawer"
        showCloseButton={false}
        className={cn(
          "flex flex-col gap-0 overflow-hidden p-0",
          isDesktop
            ? "w-full sm:max-w-md"
            : "!inset-0 !top-0 !left-0 !h-dvh !w-full !max-w-none !border-none",
        )}
      >
        {/* ── Drawer header ─────────────────────────────────────────────── */}
        <SheetHeader className="flex flex-row items-center justify-between border-b px-6 py-4">
          <SheetTitle className="text-base font-semibold">Filters</SheetTitle>
          <div className="flex items-center gap-1">
            {activeCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAll}
                data-testid="clear-all-filters"
                className="h-8 gap-1.5 px-3 text-xs text-muted-foreground hover:text-destructive"
              >
                <X className="size-3.5" />
                Clear all ({activeCount})
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              data-testid="filter-drawer-close"
              aria-label="Close filters"
              onClick={() => setOpen(false)}
            >
              <X className="size-4" />
            </Button>
          </div>
        </SheetHeader>

        {/* ── Scrollable filter body ─────────────────────────────────────── */}
        <div className="flex-1 space-y-0 overflow-y-auto">
          {/* Drawer ad unit */}
          {process.env.NEXT_PUBLIC_ADSENSE_ENABLED === "true" && (
            <div className="min-h-[90px] px-6 pt-4" data-testid="drawer-ad-unit">
              <AdUnit
                slotId={process.env.NEXT_PUBLIC_ADSENSE_SLOT_DRAWER ?? ""}
                format="horizontal"
              />
            </div>
          )}

          <Accordion
            type="multiple"
            value={openSections}
            onValueChange={setOpenSections}
            className="px-6"
          >
            {/* Sort */}
            <AccordionItem value="sort">
              <AccordionTrigger
                data-testid="filter-section-toggle-sort"
                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Sort by
              </AccordionTrigger>
              <AccordionContent data-testid="filter-section-sort">
                <div className="flex flex-wrap gap-2" role="group" aria-label="Sort options">
                  {[
                    { value: "latest", label: "Latest" },
                    { value: "expiringSoon", label: "Expiring Soon" },
                  ].map(({ value, label }) => (
                    <Button
                      key={value}
                      type="button"
                      data-testid={`sort-${value}`}
                      variant={pendingSort === value ? "default" : "outline"}
                      className="h-auto min-h-10 rounded-md px-4 py-2 text-sm font-medium"
                      onClick={() => setPendingSort(value)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Bank */}
            <AccordionItem value="bank">
              <AccordionTrigger
                data-testid="filter-section-toggle-bank"
                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Bank
              </AccordionTrigger>
              <AccordionContent data-testid="filter-section-bank">
                <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by bank">
                  <Button
                    type="button"
                    data-testid="bank-filter-all"
                    variant={pendingBanks.length === 0 ? "default" : "outline"}
                    className="h-auto min-h-10 rounded-full px-5 py-2 text-sm font-semibold"
                    onClick={() => setPendingBanks([])}
                  >
                    All Banks
                  </Button>
                  {BANKS.map(([bank, meta]) => {
                    const isSelected = pendingBanks.includes(bank);
                    return (
                      <Button
                        key={bank}
                        type="button"
                        data-testid={`bank-filter-${bank}`}
                        variant={isSelected ? "default" : "outline"}
                        aria-pressed={isSelected}
                        className={cn(
                          "h-auto min-h-10 rounded-full px-5 py-2 text-sm font-semibold",
                          isSelected
                            ? "border-transparent text-primary-foreground hover:opacity-95"
                            : "bg-background text-foreground hover:bg-accent",
                        )}
                        style={isSelected ? { backgroundColor: meta.color } : undefined}
                        onClick={() => setPendingBanks(toggle(pendingBanks, bank))}
                      >
                        {meta.displayName}
                      </Button>
                    );
                  })}
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Category */}
            <AccordionItem value="category" data-testid="category-section">
              <AccordionTrigger
                data-testid="filter-section-toggle-category"
                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Category
              </AccordionTrigger>
              <AccordionContent data-testid="filter-section-category">
                <div
                  className="flex flex-wrap gap-2"
                  role="group"
                  aria-label="Filter by category"
                >
                  <Button
                    type="button"
                    data-testid="category-chip-all"
                    variant={pendingCategories.length === 0 ? "default" : "outline"}
                    className="h-auto min-h-10 rounded-md px-4 py-2 text-sm font-medium"
                    onClick={() => setPendingCategories([])}
                  >
                    All
                  </Button>

                  {categoriesLoading &&
                    Array.from({ length: 6 }).map((_, i) => (
                      <Skeleton
                        key={i}
                        data-testid="category-skeleton"
                        className="h-10 w-24 rounded-md"
                      />
                    ))}

                  {!categoriesLoading &&
                    categories.map((cat) => {
                      const isSelected = pendingCategories.includes(cat.category);
                      return (
                        <Button
                          key={cat.category}
                          type="button"
                          data-testid={`category-chip-${cat.category}`}
                          variant={isSelected ? "default" : "outline"}
                          aria-pressed={isSelected}
                          className="h-auto min-h-10 rounded-md px-4 py-2 text-sm font-medium"
                          onClick={() =>
                            setPendingCategories(toggle(pendingCategories, cat.category))
                          }
                        >
                          {cat.label}
                        </Button>
                      );
                    })}
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Offer Type */}
            <AccordionItem value="offerType">
              <AccordionTrigger
                data-testid="filter-section-toggle-offerType"
                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Offer Type
              </AccordionTrigger>
              <AccordionContent data-testid="filter-section-offerType">
                <div
                  className="flex flex-wrap gap-2"
                  role="group"
                  aria-label="Filter by offer type"
                >
                  <Button
                    type="button"
                    data-testid="offer-type-all"
                    variant={pendingOfferTypes.length === 0 ? "default" : "outline"}
                    className="h-auto min-h-10 rounded-md px-4 py-2 text-sm font-medium"
                    onClick={() => setPendingOfferTypes([])}
                  >
                    All Types
                  </Button>
                  {OFFER_TYPES.map((type) => {
                    const isSelected = pendingOfferTypes.includes(type.value);
                    return (
                      <Button
                        key={type.value}
                        type="button"
                        data-testid={`offer-type-${type.value}`}
                        variant={isSelected ? "default" : "outline"}
                        aria-pressed={isSelected}
                        className="h-auto min-h-10 rounded-md px-4 py-2 text-sm font-medium"
                        onClick={() => setPendingOfferTypes(toggle(pendingOfferTypes, type.value))}
                      >
                        {type.label}
                      </Button>
                    );
                  })}
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Include Expired */}
            <AccordionItem value="includeExpired">
              <AccordionTrigger
                data-testid="filter-section-toggle-includeExpired"
                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Expired Offers
              </AccordionTrigger>
              <AccordionContent data-testid="filter-section-includeExpired">
                <Button
                  type="button"
                  data-testid="include-expired-toggle"
                  variant={pendingIncludeExpired ? "default" : "outline"}
                  aria-pressed={pendingIncludeExpired}
                  className="h-auto min-h-10 rounded-md px-4 py-2 text-sm font-medium"
                  onClick={() => setPendingIncludeExpired((prev) => !prev)}
                >
                  {pendingIncludeExpired ? "Showing expired offers" : "Include expired offers"}
                </Button>
              </AccordionContent>
            </AccordionItem>

            {/* Date Range — always last */}
            <AccordionItem value="dateRange">
              <AccordionTrigger
                data-testid="filter-section-toggle-dateRange"
                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Date Range
              </AccordionTrigger>
              <AccordionContent data-testid="filter-section-dateRange">
                {(fromDate || toDate_) && (
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-medium text-foreground">
                      {fromDate && toDate_
                        ? `${format(fromDate, "dd MMM")} – ${format(toDate_, "dd MMM yyyy")}`
                        : fromDate
                          ? `From ${format(fromDate, "dd MMM yyyy")}`
                          : `Until ${format(toDate_!, "dd MMM yyyy")}`}
                    </p>
                    <button
                      type="button"
                      onClick={() => setPendingDateRange(undefined)}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
                      aria-label="Clear date range"
                    >
                      <X className="size-3" />
                      Clear
                    </button>
                  </div>
                )}
                <div className="overflow-x-auto">
                  <Calendar
                    mode="range"
                    numberOfMonths={2}
                    selected={pendingDateRange}
                    onSelect={setPendingDateRange}
                    captionLayout="dropdown"
                  />
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        {/* ── Sticky footer: Apply Filters ──────────────────────────────────── */}
        <div className="border-t border-border bg-background px-6 py-4">
          <Button
            type="button"
            data-testid="apply-filters"
            className="w-full gap-2"
            onClick={applyFilters}
          >
            <Check className="size-4" aria-hidden />
            Apply Filters
            {pendingCount > 0 && (
              <span className="ml-1 rounded-full bg-primary-foreground/20 px-1.5 py-0.5 text-xs">
                {pendingCount}
              </span>
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
