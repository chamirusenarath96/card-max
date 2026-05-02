"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { X } from "lucide-react";
import { format } from "date-fns";
import { BANK_METADATA } from "../../../specs/data/offer.schema";
import type { Bank } from "../../../specs/data/offer.schema";
import { FilterDrawer } from "./FilterDrawer";
import { SavePresetPopover } from "./SavePresetPopover";
import { Badge } from "@/components/ui/badge";
import { useFilterPresets } from "@/hooks/useFilterPresets";

interface Props {
  activeBank?: string;
  activeCategory?: string;
  activeOfferType?: string;
  activeFrom?: string;
  activeTo?: string;
  activeSort?: string;
  includeExpired?: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  dining: "Dining",
  shopping: "Shopping",
  travel: "Travel",
  lodging: "Lodging",
  homecare: "Home Care",
  clothing: "Clothing",
  fuel: "Fuel",
  groceries: "Groceries",
  entertainment: "Entertainment",
  wellness: "Wellness",
  healthcare: "Healthcare",
  installments: "Installments",
  online: "Online",
  other: "Other",
};

const OFFER_TYPE_LABELS: Record<string, string> = {
  percentage: "% Discount",
  cashback: "Cashback",
  bogo: "Buy 1 Get 1",
  installment: "Installment Plans",
  fixed_amount: "Fixed Amount Off",
  points: "Points / Miles",
  free_item: "Free Items",
  other: "Other",
};

function toDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return isNaN(d.getTime()) ? undefined : d;
}

export function FilterBar({
  activeBank,
  activeCategory,
  activeOfferType,
  activeFrom,
  activeTo,
  activeSort,
  includeExpired,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { savePreset } = useFilterPresets();

  function removeParam(key: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete(key);
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function removeDateParams() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("activeFrom");
    params.delete("activeTo");
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  const fromDate = toDate(activeFrom);
  const toDate_ = toDate(activeTo);

  let dateChipLabel: string | null = null;
  if (fromDate && toDate_) {
    dateChipLabel = `${format(fromDate, "dd MMM")} – ${format(toDate_, "dd MMM yyyy")}`;
  } else if (fromDate) {
    dateChipLabel = `From ${format(fromDate, "dd MMM yyyy")}`;
  } else if (toDate_) {
    dateChipLabel = `Until ${format(toDate_, "dd MMM yyyy")}`;
  }

  const chips: { key: string; label: string; onRemove: () => void }[] = [];
  if (activeBank) {
    chips.push({
      key: "bank",
      label: BANK_METADATA[activeBank as Bank]?.displayName ?? activeBank,
      onRemove: () => removeParam("bank"),
    });
  }
  if (activeCategory) {
    chips.push({
      key: "category",
      label: CATEGORY_LABELS[activeCategory] ?? activeCategory,
      onRemove: () => removeParam("category"),
    });
  }
  if (activeOfferType) {
    chips.push({
      key: "offerType",
      label: OFFER_TYPE_LABELS[activeOfferType] ?? activeOfferType,
      onRemove: () => removeParam("offerType"),
    });
  }
  if (activeSort && activeSort !== "latest") {
    chips.push({
      key: "sort",
      label: activeSort === "expiringSoon" ? "Expiring Soon" : activeSort,
      onRemove: () => removeParam("sort"),
    });
  }
  if (dateChipLabel) {
    chips.push({
      key: "date",
      label: dateChipLabel,
      onRemove: removeDateParams,
    });
  }
  if (includeExpired === "true") {
    chips.push({
      key: "includeExpired",
      label: "Including Expired",
      onRemove: () => removeParam("includeExpired"),
    });
  }

  const activeFilters = {
    ...(activeBank ? { bank: activeBank } : {}),
    ...(activeCategory ? { category: activeCategory } : {}),
    ...(activeOfferType ? { offerType: activeOfferType } : {}),
    ...(activeSort && activeSort !== "latest" ? { sort: activeSort } : {}),
    ...(activeFrom ? { activeFrom } : {}),
    ...(activeTo ? { activeTo } : {}),
  };

  return (
    <div data-testid="filter-bar">
      <div className="flex flex-wrap items-center gap-3">
        <FilterDrawer
          activeBank={activeBank}
          activeCategory={activeCategory}
          activeOfferType={activeOfferType}
          activeFrom={activeFrom}
          activeTo={activeTo}
          activeSort={activeSort}
          includeExpired={includeExpired}
        />

        {chips.map((chip) => (
          <Badge
            key={chip.key}
            variant="secondary"
            className="flex h-9 items-center gap-1.5 rounded-full px-3.5 py-1 text-sm font-medium"
          >
            {chip.label}
            <button
              type="button"
              onClick={chip.onRemove}
              className="ml-0.5 rounded-full p-0.5 hover:bg-foreground/10"
              aria-label={`Remove ${chip.label} filter`}
            >
              <X className="size-3" />
            </button>
          </Badge>
        ))}

        {chips.length > 0 && (
          <SavePresetPopover
            filters={activeFilters}
            onSave={savePreset}
          />
        )}
      </div>
    </div>
  );
}
