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
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useCategories } from "@/hooks/useCategories";
import { useNavigationProgress } from "@/components/layout/NavigationProgressContext";

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
  activeBank?: string;
  activeCategory?: string;
  activeOfferType?: string;
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

export function FilterDrawer({
  activeBank,
  activeCategory,
  activeOfferType,
  activeFrom,
  activeTo,
  activeSort,
  includeExpired,
}: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { navigate } = useNavigationProgress();
  const { data: categories, isLoading: categoriesLoading } = useCategories();

  // ── Controlled drawer open state ──────────────────────────────────────────
  const [open, setOpen] = useState(false);

  // ── Pending filter state — updated locally, applied on "Apply Filters" ───
  const [pendingBank, setPendingBank] = useState<string>("");
  const [pendingCategory, setPendingCategory] = useState<string>("");
  const [pendingOfferType, setPendingOfferType] = useState<string>("");
  const [pendingSort, setPendingSort] = useState<string>("latest");
  const [pendingIncludeExpired, setPendingIncludeExpired] = useState<boolean>(false);
  const [pendingDateRange, setPendingDateRange] = useState<DateRange | undefined>(undefined);

  /**
   * Sync pending state from URL params when the drawer opens.
   * Called inside the onOpenChange event handler — not inside a useEffect —
   * so setting state in a batch is correct and avoids cascading renders.
   */
  function syncPendingFromUrl() {
    setPendingBank(activeBank ?? "");
    setPendingCategory(activeCategory ?? "");
    setPendingOfferType(activeOfferType ?? "");
    setPendingSort(activeSort ?? "latest");
    setPendingIncludeExpired(includeExpired ?? false);
    const from = toDate(activeFrom);
    const to = toDate(activeTo);
    setPendingDateRange(from || to ? { from, to } : undefined);
  }

  function handleOpenChange(isOpen: boolean) {
    if (isOpen) syncPendingFromUrl();
    setOpen(isOpen);
  }

  // ── Active count (reflects applied URL state, shown on trigger badge) ────
  const activeCount = [
    activeBank,
    activeCategory,
    activeOfferType,
    activeFrom,
    activeTo,
    activeSort && activeSort !== "latest" ? activeSort : null,
    includeExpired ? "expired" : null,
  ].filter(Boolean).length;

  // ── Pending count (reflects changes not yet applied) ─────────────────────
  const pendingCount = [
    pendingBank,
    pendingCategory,
    pendingOfferType,
    pendingDateRange?.from ? toISODate(pendingDateRange.from) : null,
    pendingDateRange?.to ? toISODate(pendingDateRange.to) : null,
    pendingSort !== "latest" ? pendingSort : null,
    pendingIncludeExpired ? "expired" : null,
  ].filter(Boolean).length;

  // ── Apply all pending state to URL (single router.push call) ─────────────
  function applyFilters() {
    const params = new URLSearchParams(searchParams.toString());

    if (pendingBank) params.set("bank", pendingBank); else params.delete("bank");
    if (pendingCategory) params.set("category", pendingCategory); else params.delete("category");
    if (pendingOfferType) params.set("offerType", pendingOfferType); else params.delete("offerType");
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
    setPendingBank("");
    setPendingCategory("");
    setPendingOfferType("");
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
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
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
                Clear all
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

          {/* Sort */}
          <section className="px-6 py-5">
            <Label className="mb-3 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Sort by
            </Label>
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
          </section>

          {/* Bank */}
          <section className="px-6 py-5">
            <Label className="mb-3 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Bank
            </Label>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by bank">
              <Button
                type="button"
                data-testid="bank-filter-all"
                variant={!pendingBank ? "default" : "outline"}
                className="h-auto min-h-10 rounded-full px-5 py-2 text-sm font-semibold"
                onClick={() => setPendingBank("")}
              >
                All Banks
              </Button>
              {BANKS.map(([bank, meta]) => {
                const isSelected = pendingBank === bank;
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
                    onClick={() => setPendingBank(pendingBank === bank ? "" : bank)}
                  >
                    {meta.displayName}
                  </Button>
                );
              })}
            </div>
          </section>

          {/* Date Range */}
          <section className="px-6 py-5">
            <div className="mb-3 flex items-center justify-between">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Date Range
              </Label>
              {(fromDate || toDate_) && (
                <button
                  type="button"
                  onClick={() => setPendingDateRange(undefined)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
                  aria-label="Clear date range"
                >
                  <X className="size-3" />
                  Clear
                </button>
              )}
            </div>
            {(fromDate || toDate_) && (
              <p className="mb-3 text-sm font-medium text-foreground">
                {fromDate && toDate_
                  ? `${format(fromDate, "dd MMM")} – ${format(toDate_, "dd MMM yyyy")}`
                  : fromDate
                    ? `From ${format(fromDate, "dd MMM yyyy")}`
                    : `Until ${format(toDate_!, "dd MMM yyyy")}`}
              </p>
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
          </section>

          {/* Category */}
          <section className="px-6 py-5" data-testid="category-section">
            <Label className="mb-3 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Category
            </Label>
            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label="Filter by category"
            >
              <Button
                type="button"
                data-testid="category-chip-all"
                variant={!pendingCategory ? "default" : "outline"}
                className="h-auto min-h-10 rounded-md px-4 py-2 text-sm font-medium"
                onClick={() => setPendingCategory("")}
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
                categories.map((cat) => (
                  <Button
                    key={cat.category}
                    type="button"
                    data-testid={`category-chip-${cat.category}`}
                    variant={pendingCategory === cat.category ? "default" : "outline"}
                    aria-pressed={pendingCategory === cat.category}
                    className="h-auto min-h-10 rounded-md px-4 py-2 text-sm font-medium"
                    onClick={() =>
                      setPendingCategory(
                        pendingCategory === cat.category ? "" : cat.category,
                      )
                    }
                  >
                    {cat.label}
                  </Button>
                ))}
            </div>
          </section>

          {/* Offer Type */}
          <section className="px-6 py-5">
            <Label className="mb-3 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Offer Type
            </Label>
            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label="Filter by offer type"
            >
              <Button
                type="button"
                data-testid="offer-type-all"
                variant={!pendingOfferType ? "default" : "outline"}
                className="h-auto min-h-10 rounded-md px-4 py-2 text-sm font-medium"
                onClick={() => setPendingOfferType("")}
              >
                All Types
              </Button>
              {OFFER_TYPES.map((type) => (
                <Button
                  key={type.value}
                  type="button"
                  data-testid={`offer-type-${type.value}`}
                  variant={pendingOfferType === type.value ? "default" : "outline"}
                  aria-pressed={pendingOfferType === type.value}
                  className="h-auto min-h-10 rounded-md px-4 py-2 text-sm font-medium"
                  onClick={() =>
                    setPendingOfferType(
                      pendingOfferType === type.value ? "" : type.value,
                    )
                  }
                >
                  {type.label}
                </Button>
              ))}
            </div>
          </section>

          {/* Include Expired */}
          <section className="px-6 py-5">
            <Label className="mb-3 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Expired Offers
            </Label>
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
          </section>
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
