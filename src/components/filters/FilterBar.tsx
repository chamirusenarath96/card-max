"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { BANK_METADATA } from "../../../specs/data/offer.schema";
import type { Bank } from "../../../specs/data/offer.schema";
import { DateFilter } from "./DateFilter";

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

  function handleCategoryClick(cat: string) {
    setParam("category", activeCategory === cat ? null : cat);
  }

  function handleOfferTypeClick(type: string) {
    setParam("offerType", activeOfferType === type ? null : type);
  }

  function handleSortClick(sort: string) {
    setParam("sort", activeSort === sort ? null : sort);
  }

  const currentSort = activeSort ?? "latest";

  return (
    <div className="space-y-8" data-testid="filter-bar">
      {/* Quick filters: Latest / Expiring Soon */}
      <div>
        <h2 className="font-[family-name:var(--font-space-grotesk)] text-sm uppercase tracking-widest text-primary font-bold mb-4">
          Quick Filters
        </h2>
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide" role="group" aria-label="Quick filters">
          <button
            data-testid="sort-latest"
            onClick={() => handleSortClick("latest")}
            className={[
              "px-5 py-3 rounded-xl font-medium text-sm transition-colors whitespace-nowrap flex-shrink-0",
              currentSort === "latest"
                ? "bg-primary text-on-primary"
                : "bg-surface-highest text-on-surface-variant hover:bg-surface-high",
            ].join(" ")}
          >
            Latest
          </button>
          <button
            data-testid="sort-expiringSoon"
            onClick={() => handleSortClick("expiringSoon")}
            className={[
              "px-5 py-3 rounded-xl font-medium text-sm transition-colors whitespace-nowrap flex-shrink-0",
              currentSort === "expiringSoon"
                ? "bg-tertiary text-on-tertiary"
                : "bg-surface-highest text-on-surface-variant hover:bg-surface-high",
            ].join(" ")}
          >
            Expiring Soon
          </button>
        </div>
      </div>

      {/* Bank filter */}
      <div>
        <h2 className="font-[family-name:var(--font-space-grotesk)] text-sm uppercase tracking-widest text-primary font-bold mb-4">
          Filter by Bank
        </h2>
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide" role="group" aria-label="Filter by bank">
          <button
            data-testid="bank-filter-all"
            onClick={() => setParam("bank", null)}
            className={[
              "px-6 py-3 rounded-full font-[family-name:var(--font-space-grotesk)] font-bold text-sm transition-all shadow-sm whitespace-nowrap flex-shrink-0",
              !activeBank
                ? "bg-primary text-on-primary shadow-md"
                : "bg-surface-lowest text-on-surface hover:bg-primary-container hover:text-on-primary-container",
            ].join(" ")}
          >
            All Banks
          </button>
          {BANKS.map(([bank, meta]) => {
            const isActive = activeBank === bank;
            return (
              <button
                key={bank}
                data-testid={`bank-filter-${bank}`}
                onClick={() => handleBankClick(bank)}
                aria-pressed={isActive}
                className={[
                  "px-6 py-3 rounded-full font-[family-name:var(--font-space-grotesk)] font-bold text-sm transition-all shadow-sm whitespace-nowrap flex-shrink-0",
                  isActive
                    ? "text-white shadow-md"
                    : "bg-surface-lowest text-on-surface hover:bg-primary-container hover:text-on-primary-container",
                ].join(" ")}
                style={isActive ? { backgroundColor: meta.color } : undefined}
              >
                {meta.displayName}
              </button>
            );
          })}
        </div>
      </div>

      {/* Date filter */}
      <DateFilter activeFrom={activeFrom} activeTo={activeTo} />

      {/* Category chips */}
      <div>
        <h2 className="font-[family-name:var(--font-space-grotesk)] text-sm uppercase tracking-widest text-primary font-bold mb-4">
          Category
        </h2>
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide" role="group" aria-label="Filter by category">
          <button
            data-testid="category-chip-all"
            onClick={() => setParam("category", null)}
            className={[
              "px-5 py-3 rounded-xl font-medium text-sm transition-colors whitespace-nowrap flex-shrink-0",
              !activeCategory
                ? "bg-primary text-on-primary"
                : "bg-surface-highest text-on-surface-variant hover:bg-surface-high",
            ].join(" ")}
          >
            All
          </button>
          {CATEGORIES.map((cat) => {
            const isActive = activeCategory === cat.value;
            return (
              <button
                key={cat.value}
                data-testid={`category-chip-${cat.value}`}
                onClick={() => handleCategoryClick(cat.value)}
                aria-pressed={isActive}
                className={[
                  "px-5 py-3 rounded-xl font-medium text-sm transition-colors whitespace-nowrap flex-shrink-0",
                  isActive
                    ? "bg-primary text-on-primary"
                    : "bg-surface-highest text-on-surface-variant hover:bg-surface-high",
                ].join(" ")}
              >
                {cat.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Hidden select for category (backwards compat with tests) */}
      <select id="category-filter" value={activeCategory ?? ""} onChange={(e) => setParam("category", e.target.value || null)} data-testid="category-filter" className="sr-only" tabIndex={-1} aria-hidden="true">
        <option value="">All Categories</option>
        {CATEGORIES.map((cat) => (<option key={cat.value} value={cat.value}>{cat.label}</option>))}
      </select>

      {/* Offer type chips */}
      <div>
        <h2 className="font-[family-name:var(--font-space-grotesk)] text-sm uppercase tracking-widest text-primary font-bold mb-4">
          Offer Type
        </h2>
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide" role="group" aria-label="Filter by offer type">
          <button
            data-testid="offer-type-all"
            onClick={() => setParam("offerType", null)}
            className={[
              "px-5 py-3 rounded-xl font-medium text-sm transition-colors whitespace-nowrap flex-shrink-0",
              !activeOfferType
                ? "bg-primary text-on-primary"
                : "bg-surface-highest text-on-surface-variant hover:bg-surface-high",
            ].join(" ")}
          >
            All Types
          </button>
          {OFFER_TYPES.map((type) => {
            const isActive = activeOfferType === type.value;
            return (
              <button
                key={type.value}
                data-testid={`offer-type-${type.value}`}
                onClick={() => handleOfferTypeClick(type.value)}
                aria-pressed={isActive}
                className={[
                  "px-5 py-3 rounded-xl font-medium text-sm transition-colors whitespace-nowrap flex-shrink-0",
                  isActive
                    ? "bg-primary text-on-primary"
                    : "bg-surface-highest text-on-surface-variant hover:bg-surface-high",
                ].join(" ")}
              >
                {type.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Hidden select for offer type (backwards compat with tests) */}
      <select id="offer-type-filter" value={activeOfferType ?? ""} onChange={(e) => setParam("offerType", e.target.value || null)} data-testid="offer-type-filter" className="sr-only" tabIndex={-1} aria-hidden="true">
        <option value="">All Types</option>
        {OFFER_TYPES.map((type) => (<option key={type.value} value={type.value}>{type.label}</option>))}
      </select>
    </div>
  );
}
