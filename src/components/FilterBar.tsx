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

interface Props {
  activeBank?: string;
  activeCategory?: string;
}

export function FilterBar({ activeBank, activeCategory }: Props) {
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
    params.delete("page"); // reset pagination on filter change
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function handleBankClick(bank: Bank) {
    // Toggle: click active bank to deselect
    setParam("bank", activeBank === bank ? null : bank);
  }

  function handleCategoryChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setParam("category", e.target.value || null);
  }

  return (
    <div className="mb-6 space-y-3">
      {/* Bank filter chips */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by bank">
        {BANKS.map(([bank, meta]) => {
          const isActive = activeBank === bank;
          return (
            <button
              key={bank}
              data-testid={`bank-filter-${bank}`}
              onClick={() => handleBankClick(bank)}
              aria-pressed={isActive}
              className={[
                "px-4 py-1.5 rounded-full text-sm font-medium transition-colors border",
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

      {/* Category dropdown */}
      <div>
        <label htmlFor="category-filter" className="sr-only">
          Filter by category
        </label>
        <select
          id="category-filter"
          value={activeCategory ?? ""}
          onChange={handleCategoryChange}
          data-testid="category-filter"
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {CATEGORIES.map((cat) => (
            <option key={cat.value} value={cat.value}>
              {cat.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
