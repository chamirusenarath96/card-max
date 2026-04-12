"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const SUGGESTION_CHIPS: { label: string; params: Record<string, string> }[] = [
  { label: "Dining", params: { category: "dining" } },
  { label: "Shopping", params: { category: "shopping" } },
  { label: "Online", params: { category: "online" } },
  { label: "Cashback", params: { offerType: "cashback" } },
  { label: "Buy 1 Get 1", params: { offerType: "bogo" } },
  { label: "Expiring Soon", params: { sort: "expiringSoon" } },
  { label: "Hotels", params: { q: "hotel" } },
  { label: "Supermarkets", params: { q: "supermarket" } },
];

const EXAMPLE_QUERIES = ['"pizza"', '"cashback"', '"dining"', '"hotels"'];

interface Props {
  initialQuery?: string;
}

export function HeroSearch({ initialQuery = "" }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function pushSearch(q: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (q.trim()) params.set("q", q.trim()); else params.delete("q");
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function handleChip(chipParams: Record<string, string>) {
    const params = new URLSearchParams();
    Object.entries(chipParams).forEach(([k, v]) => params.set(k, v));
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-col items-center gap-5" data-testid="hero-search">
      {/* Search input row */}
      <div className="flex w-full max-w-2xl items-center gap-3">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            data-testid="hero-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && pushSearch(query)}
            placeholder="Search offers, merchants, or banks..."
            className="h-14 rounded-full border-border bg-background pl-12 pr-4 text-base shadow-md focus-visible:ring-primary/50"
            aria-label="Search offers"
          />
        </div>
        <Button
          onClick={() => pushSearch(query)}
          data-testid="hero-search-button"
          size="lg"
          className="h-14 shrink-0 rounded-full px-8 text-base font-semibold shadow-md"
        >
          Search Now
        </Button>
      </div>

      {/* Example hint */}
      <p className="text-sm text-muted-foreground" data-testid="hero-search-hint">
        Try searching for {EXAMPLE_QUERIES.join(", ")}
      </p>

      {/* Suggestion chips */}
      <div
        className="flex flex-wrap justify-center gap-2"
        data-testid="search-suggestions"
        role="group"
        aria-label="Search suggestions"
      >
        {SUGGESTION_CHIPS.map((chip) => (
          <button
            key={chip.label}
            type="button"
            data-testid={`suggestion-${chip.label.toLowerCase().replace(/\s+/g, "-")}`}
            onClick={() => handleChip(chip.params)}
            className="inline-flex items-center rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            {chip.label}
          </button>
        ))}
      </div>
    </div>
  );
}
