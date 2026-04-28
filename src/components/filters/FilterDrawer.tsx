"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { SlidersHorizontal, X } from "lucide-react";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { BANK_METADATA } from "../../../specs/data/offer.schema";
import type { Bank } from "../../../specs/data/offer.schema";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const BANKS = Object.entries(BANK_METADATA) as [Bank, (typeof BANK_METADATA)[Bank]][];

const CATEGORIES: { value: string; label: string }[] = [
  { value: "dining", label: "Dining" },
  { value: "groceries", label: "Groceries" },
  { value: "travel", label: "Travel" },
  { value: "lodging", label: "Lodging" },
  { value: "shopping", label: "Shopping" },
  { value: "clothing", label: "Clothing" },
  { value: "homecare", label: "Home Care" },
  { value: "online", label: "Online" },
  { value: "wellness", label: "Wellness" },
  { value: "healthcare", label: "Healthcare" },
  { value: "fuel", label: "Fuel" },
  { value: "entertainment", label: "Entertainment" },
  { value: "installments", label: "Installments" },
  { value: "other", label: "Other" },
];

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
}

export function FilterDrawer({
  activeBank,
  activeCategory,
  activeOfferType,
  activeFrom,
  activeTo,
  activeSort,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function clearAll() {
    router.push(pathname);
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

  const fromDate = toDate(activeFrom);
  const toDate_ = toDate(activeTo);
  const dateRange: DateRange | undefined =
    fromDate || toDate_ ? { from: fromDate, to: toDate_ } : undefined;

  function handleDateSelect(selected: DateRange | undefined) {
    const params = new URLSearchParams(searchParams.toString());
    const from = toISODate(selected?.from);
    const to = toISODate(selected?.to);
    if (from) params.set("activeFrom", from); else params.delete("activeFrom");
    if (to) params.set("activeTo", to); else params.delete("activeTo");
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function clearDates() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("activeFrom");
    params.delete("activeTo");
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  const currentSort = activeSort ?? "latest";

  const activeCount = [
    activeBank,
    activeCategory,
    activeOfferType,
    activeFrom,
    activeTo,
    activeSort && activeSort !== "latest" ? activeSort : null,
  ].filter(Boolean).length;

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          data-testid="filter-drawer-trigger"
          className="relative h-auto min-h-11 gap-2 rounded-lg px-5 py-2.5 font-medium"
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
        className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-md"
      >
        <SheetHeader className="flex flex-row items-center justify-between border-b px-6 py-4">
          <SheetTitle className="text-base font-semibold">Filters</SheetTitle>
          {activeCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAll}
              className="h-8 gap-1.5 px-3 text-xs text-muted-foreground hover:text-destructive"
            >
              <X className="size-3.5" />
              Clear all
            </Button>
          )}
        </SheetHeader>

        <div className="flex-1 space-y-0 overflow-y-auto">
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
                  variant={currentSort === value ? "default" : "outline"}
                  className="h-auto min-h-10 rounded-md px-4 py-2 text-sm font-medium"
                  onClick={() => setParam("sort", value === "latest" ? null : value)}
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
                variant={!activeBank ? "default" : "outline"}
                className="h-auto min-h-10 rounded-full px-5 py-2 text-sm font-semibold"
                onClick={() => setParam("bank", null)}
              >
                All Banks
              </Button>
              {BANKS.map(([bank, meta]) => {
                const isActive = activeBank === bank;
                return (
                  <Button
                    key={bank}
                    type="button"
                    data-testid={`bank-filter-${bank}`}
                    variant={isActive ? "default" : "outline"}
                    aria-pressed={isActive}
                    className={cn(
                      "h-auto min-h-10 rounded-full px-5 py-2 text-sm font-semibold",
                      isActive
                        ? "border-transparent text-primary-foreground hover:opacity-95"
                        : "bg-background text-foreground hover:bg-accent",
                    )}
                    style={isActive ? { backgroundColor: meta.color } : undefined}
                    onClick={() => setParam("bank", activeBank === bank ? null : bank)}
                  >
                    {meta.displayName}
                  </Button>
                );
              })}
            </div>
          </section>

          {/* Date Range — inline calendar, no nested popover */}
          <section className="px-6 py-5">
            <div className="mb-3 flex items-center justify-between">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Date Range
              </Label>
              {(activeFrom || activeTo) && (
                <button
                  type="button"
                  onClick={clearDates}
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
                selected={dateRange}
                onSelect={handleDateSelect}
                captionLayout="dropdown"
              />
            </div>
          </section>

          {/* Category */}
          <section className="px-6 py-5">
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
                variant={!activeCategory ? "default" : "outline"}
                className="h-auto min-h-10 rounded-md px-4 py-2 text-sm font-medium"
                onClick={() => setParam("category", null)}
              >
                All
              </Button>
              {CATEGORIES.map((cat) => (
                <Button
                  key={cat.value}
                  type="button"
                  data-testid={`category-chip-${cat.value}`}
                  variant={activeCategory === cat.value ? "default" : "outline"}
                  aria-pressed={activeCategory === cat.value}
                  className="h-auto min-h-10 rounded-md px-4 py-2 text-sm font-medium"
                  onClick={() =>
                    setParam("category", activeCategory === cat.value ? null : cat.value)
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
                variant={!activeOfferType ? "default" : "outline"}
                className="h-auto min-h-10 rounded-md px-4 py-2 text-sm font-medium"
                onClick={() => setParam("offerType", null)}
              >
                All Types
              </Button>
              {OFFER_TYPES.map((type) => (
                <Button
                  key={type.value}
                  type="button"
                  data-testid={`offer-type-${type.value}`}
                  variant={activeOfferType === type.value ? "default" : "outline"}
                  aria-pressed={activeOfferType === type.value}
                  className="h-auto min-h-10 rounded-md px-4 py-2 text-sm font-medium"
                  onClick={() =>
                    setParam(
                      "offerType",
                      activeOfferType === type.value ? null : type.value,
                    )
                  }
                >
                  {type.label}
                </Button>
              ))}
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
