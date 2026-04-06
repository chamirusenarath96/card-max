"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { BANK_METADATA } from "../../specs/data/offer.schema";
import type { Bank } from "../../specs/data/offer.schema";

const BANKS = Object.entries(BANK_METADATA) as [
  Bank,
  (typeof BANK_METADATA)[Bank],
][];

const CATEGORIES = [
  { value: "", label: "All Categories" },
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

const OFFER_TYPES = [
  { value: "", label: "All Types" },
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
}

export function FilterBar({ activeBank, activeCategory, activeOfferType }: Props) {
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

  function handleBankClick(bank: Bank) {
    setParam("bank", activeBank === bank ? null : bank);
  }

  function handleCategoryChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setParam("category", e.target.value || null);
  }

  function handleOfferTypeChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setParam("offerType", e.target.value || null);
  }

  return (
    <div className="space-y-4" data-testid="filter-bar">
      {/* Bank filter chips */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by bank">
        <button
          data-testid="bank-filter-all"
          onClick={() => setParam("bank", null)}
          className={[
            "px-4 py-1.5 rounded-full text-sm font-medium transition-all border",
            !activeBank
              ? "bg-gray-900 text-white border-gray-900 shadow-sm"
              : "bg-white border-gray-200 text-gray-600 hover:border-gray-400",
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
                "px-4 py-1.5 rounded-full text-sm font-medium transition-all border",
                isActive
                  ? "text-white shadow-sm border-transparent"
                  : "bg-white border-gray-200 text-gray-600 hover:border-gray-400",
              ].join(" ")}
              style={isActive ? { backgroundColor: meta.color } : undefined}
            >
              {meta.displayName}
            </button>
          );
        })}
      </div>

      {/* Dropdowns row */}
      <div className="flex flex-wrap gap-3">
        <div>
          <label htmlFor="category-filter" className="sr-only">
            Filter by category
          </label>
          <select
            id="category-filter"
            value={activeCategory ?? ""}
            onChange={handleCategoryChange}
            data-testid="category-filter"
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
          >
            {CATEGORIES.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="offer-type-filter" className="sr-only">
            Filter by offer type
          </label>
          <select
            id="offer-type-filter"
            value={activeOfferType ?? ""}
            onChange={handleOfferTypeChange}
            data-testid="offer-type-filter"
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
          >
            {OFFER_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
