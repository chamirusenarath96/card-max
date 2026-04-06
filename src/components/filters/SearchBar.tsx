"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface Props {
  initialQuery?: string;
}

const DEBOUNCE_MS = 300;

export function SearchBar({ initialQuery = "" }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(initialQuery);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  function pushQuery(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value.trim()) {
      params.set("q", value.trim());
    } else {
      params.delete("q");
    }
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setQuery(value);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => pushQuery(value), DEBOUNCE_MS);
  }

  function handleClear() {
    setQuery("");
    if (timerRef.current) clearTimeout(timerRef.current);
    pushQuery("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      if (timerRef.current) clearTimeout(timerRef.current);
      pushQuery(query);
    }
  }

  return (
    <div className="relative" data-testid="search-bar">
      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
        <svg className="h-4 w-4 text-on-surface-variant" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
      </div>
      <input
        type="search"
        data-testid="search-input"
        value={query}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="Search offers, merchants..."
        className="w-full rounded-full bg-surface-lowest py-3 pl-11 pr-11 text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:ring-2 focus:ring-primary/30 shadow-sm transition-colors"
      />
      {query && (
        <button type="button" data-testid="search-clear" onClick={handleClear} className="absolute inset-y-0 right-0 flex items-center pr-4 text-on-surface-variant hover:text-on-surface" aria-label="Clear search">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
