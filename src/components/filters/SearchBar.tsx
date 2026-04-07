"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input
        type="search"
        data-testid="search-input"
        value={query}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="Search offers, merchants..."
        className={cn(
          "h-11 rounded-full border-input bg-background py-3 pl-10 pr-10 text-sm shadow-sm",
          "placeholder:text-muted-foreground",
        )}
      />
      {query ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          data-testid="search-clear"
          onClick={handleClear}
          className="absolute right-0.5 top-1/2 size-9 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label="Clear search"
        >
          <X className="size-4" />
        </Button>
      ) : null}
    </div>
  );
}
