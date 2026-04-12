"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { Search, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSearchSuggestions } from "./useSearchSuggestions";

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
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { results, total, isLoading, isActive } = useSearchSuggestions(query);

  // Open or close dropdown based on whether the query is active
  useEffect(() => {
    setDropdownOpen(isActive);
  }, [isActive]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function pushSearch(q: string) {
    setDropdownOpen(false);
    const params = new URLSearchParams(searchParams.toString());
    if (q.trim()) params.set("q", q.trim());
    else params.delete("q");
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function handleChip(chipParams: Record<string, string>) {
    setDropdownOpen(false);
    const params = new URLSearchParams();
    Object.entries(chipParams).forEach(([k, v]) => params.set(k, v));
    router.push(`${pathname}?${params.toString()}`);
  }

  function handleResultClick(title: string) {
    setQuery(title);
    pushSearch(title);
  }

  return (
    <div className="flex flex-col items-center gap-5" data-testid="hero-search">
      {/* Search input row */}
      <div className="flex w-full max-w-2xl items-center gap-3">
        <div className="relative flex-1" ref={containerRef}>
          <Search
            className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            data-testid="hero-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") pushSearch(query);
              if (e.key === "Escape") setDropdownOpen(false);
            }}
            onFocus={() => isActive && setDropdownOpen(true)}
            placeholder="Search offers, merchants, or banks..."
            className="h-14 rounded-full border-border bg-background pl-12 pr-4 text-base shadow-md focus-visible:ring-primary/50"
            aria-label="Search offers"
            aria-expanded={dropdownOpen}
            aria-autocomplete="list"
          />

          {/* Live results dropdown */}
          {dropdownOpen && (
            <div
              data-testid="search-dropdown"
              className="absolute top-full left-0 right-0 z-50 mt-2 overflow-hidden rounded-2xl border border-border bg-background shadow-xl"
              role="listbox"
              aria-label="Search suggestions"
            >
              {isLoading && (
                <div
                  data-testid="search-loading"
                  className="flex items-center justify-center py-6"
                >
                  <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Loading" />
                </div>
              )}

              {!isLoading && results.length === 0 && (
                <div
                  data-testid="search-no-results"
                  className="px-4 py-6 text-center text-sm text-muted-foreground"
                >
                  No offers found for &ldquo;{query}&rdquo;
                </div>
              )}

              {!isLoading &&
                results.map((item) => (
                  <button
                    key={item._id}
                    type="button"
                    role="option"
                    aria-selected="false"
                    data-testid="search-result-item"
                    onClick={() => handleResultClick(item.title)}
                    className="flex w-full items-start gap-3 border-b border-border/50 px-4 py-3 text-left last:border-0 hover:bg-accent focus:bg-accent focus:outline-none"
                  >
                    <Search
                      className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {item.title}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {item.merchant} · {item.bankDisplayName}
                      </p>
                    </div>
                    {item.discountLabel && (
                      <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        {item.discountLabel}
                      </span>
                    )}
                  </button>
                ))}

              {!isLoading && total > 0 && (
                <button
                  type="button"
                  data-testid="search-see-all"
                  onClick={() => pushSearch(query)}
                  className="flex w-full items-center justify-center gap-1.5 border-t border-border px-4 py-3 text-sm font-medium text-primary hover:bg-accent"
                >
                  See all {total} results for &ldquo;{query}&rdquo;
                </button>
              )}
            </div>
          )}
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
