"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { BANK_METADATA } from "../../../specs/data/offer.schema";
import type { Bank } from "../../../specs/data/offer.schema";
import { DateFilter } from "./DateFilter";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const BANKS = Object.entries(BANK_METADATA) as [
  Bank,
  (typeof BANK_METADATA)[Bank],
][];

const CATEGORIES: { value: string; label: string }[] = [
  { value: "dining", label: "Dining" },
  { value: "shopping", label: "Shopping" },
  { value: "travel", label: "Travel" },
  { value: "fuel", label: "Fuel" },
  { value: "groceries", label: "Groceries" },
  { value: "entertainment", label: "Entertainment" },
  { value: "health", label: "Health" },
  { value: "online", label: "Online" },
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

export function FilterBar({ activeBank, activeCategory, activeOfferType, activeFrom, activeTo, activeSort }: Props) {
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

  function handleBankClick(bank: Bank | null) {
    setParam("bank", activeBank === bank ? null : bank);
  }

  function handleOfferTypeClick(type: string) {
    setParam("offerType", activeOfferType === type ? null : type);
  }

  function handleSortClick(sort: string) {
    setParam("sort", activeSort === sort ? null : sort);
  }

  function onCategoryChange(v: string) {
    if (!v) return;
    setParam("category", v === "all" ? null : v);
  }

  const currentSort = activeSort ?? "latest";

  return (
    <div className="space-y-8" data-testid="filter-bar">
      <div>
        <Label className="mb-4 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Quick Filters
        </Label>
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide" role="group" aria-label="Quick filters">
          <Button
            data-testid="sort-latest"
            type="button"
            variant={currentSort === "latest" ? "default" : "outline"}
            className={cn(
              "h-auto min-h-11 shrink-0 rounded-md px-5 py-3 text-sm font-medium whitespace-nowrap",
              currentSort === "latest" && "bg-primary text-primary-foreground",
            )}
            onClick={() => handleSortClick("latest")}
          >
            Latest
          </Button>
          <Button
            data-testid="sort-expiringSoon"
            type="button"
            variant={currentSort === "expiringSoon" ? "secondary" : "outline"}
            className="h-auto min-h-11 shrink-0 rounded-md px-5 py-3 text-sm font-medium whitespace-nowrap"
            onClick={() => handleSortClick("expiringSoon")}
          >
            Expiring Soon
          </Button>
        </div>
      </div>

      <div>
        <Label className="mb-4 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Filter by Bank
        </Label>
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide" role="group" aria-label="Filter by bank">
          <Button
            data-testid="bank-filter-all"
            type="button"
            variant={!activeBank ? "default" : "outline"}
            className={cn("h-auto min-h-11 shrink-0 rounded-full px-6 py-3 text-sm font-semibold", !activeBank && "shadow-sm")}
            onClick={() => setParam("bank", null)}
          >
            All Banks
          </Button>
          {BANKS.map(([bank, meta]) => {
            const isActive = activeBank === bank;
            return (
              <Button
                key={bank}
                data-testid={`bank-filter-${bank}`}
                type="button"
                variant={isActive ? "default" : "outline"}
                aria-pressed={isActive}
                className={cn(
                  "h-auto min-h-11 shrink-0 rounded-full px-6 py-3 text-sm font-semibold shadow-sm",
                  isActive ? "border-transparent text-primary-foreground hover:opacity-95" : "bg-background text-foreground hover:bg-accent",
                )}
                style={isActive ? { backgroundColor: meta.color } : undefined}
                onClick={() => handleBankClick(bank)}
              >
                {meta.displayName}
              </Button>
            );
          })}
        </div>
      </div>

      <DateFilter activeFrom={activeFrom} activeTo={activeTo} />

      <div>
        <Label className="mb-4 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Category
        </Label>
        <ToggleGroup
          type="single"
          value={activeCategory ?? "all"}
          onValueChange={onCategoryChange}
          variant="outline"
          spacing={0}
          className="max-w-full justify-start gap-3 overflow-x-auto pb-2 scrollbar-hide"
          role="group"
          aria-label="Filter by category"
        >
          <ToggleGroupItem
            value="all"
            data-testid="category-chip-all"
            className="h-auto min-h-11 shrink-0 rounded-md px-5 py-3 text-sm font-medium data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
          >
            All
          </ToggleGroupItem>
          {CATEGORIES.map((cat) => (
            <ToggleGroupItem
              key={cat.value}
              value={cat.value}
              data-testid={`category-chip-${cat.value}`}
              className="h-auto min-h-11 shrink-0 rounded-md px-5 py-3 text-sm font-medium data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
            >
              {cat.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <select id="category-filter" value={activeCategory ?? ""} onChange={(e) => setParam("category", e.target.value || null)} data-testid="category-filter" className="sr-only" tabIndex={-1} aria-hidden="true">
        <option value="">All Categories</option>
        {CATEGORIES.map((cat) => (<option key={cat.value} value={cat.value}>{cat.label}</option>))}
      </select>

      <div>
        <Label className="mb-4 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Offer Type
        </Label>
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide" role="group" aria-label="Filter by offer type">
          <Button
            data-testid="offer-type-all"
            type="button"
            variant={!activeOfferType ? "default" : "outline"}
            className="h-auto min-h-11 shrink-0 rounded-md px-5 py-3 text-sm font-medium whitespace-nowrap"
            onClick={() => setParam("offerType", null)}
          >
            All Types
          </Button>
          {OFFER_TYPES.map((type) => {
            const isActive = activeOfferType === type.value;
            return (
              <Button
                key={type.value}
                data-testid={`offer-type-${type.value}`}
                type="button"
                variant={isActive ? "default" : "outline"}
                aria-pressed={isActive}
                className="h-auto min-h-11 shrink-0 rounded-md px-5 py-3 text-sm font-medium whitespace-nowrap"
                onClick={() => handleOfferTypeClick(type.value)}
              >
                {type.label}
              </Button>
            );
          })}
        </div>
      </div>

      <select id="offer-type-filter" value={activeOfferType ?? ""} onChange={(e) => setParam("offerType", e.target.value || null)} data-testid="offer-type-filter" className="sr-only" tabIndex={-1} aria-hidden="true">
        <option value="">All Types</option>
        {OFFER_TYPES.map((type) => (<option key={type.value} value={type.value}>{type.label}</option>))}
      </select>
    </div>
  );
}
