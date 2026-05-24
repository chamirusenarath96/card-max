"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { Search, X, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useSearchSuggestions } from "./useSearchSuggestions";

const TYPEWRITER_PHRASES = [
  "dining offers at Keells…",
  "cashback on fuel…",
  "HNB credit card deals…",
  "hotels with 20% off…",
  "BOGO at Odel…",
];

function useTypewriter(phrases: string[]): string {
  const [displayed, setDisplayed] = useState("");

  useEffect(() => {
    if (typeof window === "undefined" || phrases.length === 0) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      setDisplayed(phrases[0] ?? "");
      return;
    }

    let phraseIndex = 0;
    let charIndex = 0;
    let isDeleting = false;
    let tid: ReturnType<typeof setTimeout>;

    function tick() {
      const phrase = phrases[phraseIndex];
      if (!phrase) return;

      if (!isDeleting) {
        charIndex++;
        setDisplayed(phrase.slice(0, charIndex));
        if (charIndex >= phrase.length) {
          isDeleting = true;
          tid = setTimeout(tick, 1800);
        } else {
          tid = setTimeout(tick, 30);
        }
      } else {
        charIndex--;
        setDisplayed(phrase.slice(0, charIndex));
        if (charIndex === 0) {
          isDeleting = false;
          phraseIndex = (phraseIndex + 1) % phrases.length;
          tid = setTimeout(tick, 30);
        } else {
          tid = setTimeout(tick, 15);
        }
      }
    }

    tid = setTimeout(tick, 30);
    return () => clearTimeout(tid);
  }, [phrases]);

  return displayed;
}

interface Props {
  initialQuery?: string;
}

export function HeroSearch({ initialQuery = "" }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // URL is the single source of truth — stays in sync with SearchDrawer
  const urlQuery = searchParams.get("q") ?? initialQuery;
  const [query, setQuery] = useState(urlQuery);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { results, total, isLoading, isActive } = useSearchSuggestions(query);

  const typewriterText = useTypewriter(TYPEWRITER_PHRASES);

  // Sync local input whenever the URL q param changes (e.g. SearchDrawer navigated)
  useEffect(() => {
    setQuery(urlQuery);
  }, [urlQuery]);

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

  /**
   * Every search resets all active filters — filters are then applied on
   * top of the search results, not carried over from a previous context.
   */
  function pushSearch(q: string) {
    setDropdownOpen(false);
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  /**
   * Clear the search: empty the input and remove ?q= from the URL while
   * preserving any other active filters (bank, category, etc.).
   * Called by both the × button and the keyboard-erase-to-empty path.
   */
  function clearSearch() {
    setQuery("");
    setDropdownOpen(false);
    const next = new URLSearchParams(searchParams.toString());
    next.delete("q");
    next.delete("page");
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  // Alias used by result-item / see-all clicks (same behaviour, clearer intent)
  const freshSearch = pushSearch;

  function handleResultClick(sourceUrl: string) {
    setDropdownOpen(false);
    window.open(sourceUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="flex flex-col items-center gap-5" data-testid="hero-search">
      {/* Search input row */}
      <div className="w-full max-w-2xl">
        <div className="relative" ref={containerRef}>
          <Search
            className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="text"
            data-testid="hero-search-input"
            value={query}
            onChange={(e) => {
              const val = e.target.value;
              setQuery(val);
              // User erased everything via keyboard — clear URL param immediately
              // so the results grid resets without needing to press Enter
              if (val === "") clearSearch();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") pushSearch(query);
              if (e.key === "Escape") {
                if (dropdownOpen) setDropdownOpen(false);
                else clearSearch();
              }
            }}
            onFocus={() => isActive && setDropdownOpen(true)}
            placeholder={typewriterText || "Search offers, merchants, or banks…"}
            className="h-14 rounded-full border-border bg-background pl-12 pr-12 text-base shadow-md focus-visible:ring-primary/50"
            aria-label="Search offers"
            aria-expanded={dropdownOpen}
            aria-autocomplete="list"
          />

          {/* Clear button — only visible when there is text in the input */}
          {query && (
            <button
              type="button"
              data-testid="hero-search-clear"
              onClick={clearSearch}
              className="absolute right-3 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              aria-label="Clear search"
            >
              <X className="size-4" />
            </button>
          )}

          {/* Live results dropdown — shows only when query >= 2 chars and API has results */}
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
                    onClick={() => handleResultClick(item.sourceUrl)}
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
                  onClick={() => freshSearch(query)}
                  className="flex w-full items-center justify-center gap-1.5 border-t border-border px-4 py-3 text-sm font-medium text-primary hover:bg-accent"
                >
                  See all {total} results for &ldquo;{query}&rdquo;
                </button>
              )}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
