"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search, TrendingUp, LayoutGrid, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const QUICK_SEARCHES = [
  "dining deals",
  "cashback",
  "buy 1 get 1",
  "hotel offers",
  "supermarket",
  "fuel discount",
  "online shopping",
  "installment plans",
];

const FILTER_JUMPS: { label: string; params: Record<string, string> }[] = [
  { label: "Expiring Soon", params: { sort: "expiringSoon" } },
  { label: "Dining", params: { category: "dining" } },
  { label: "Shopping", params: { category: "shopping" } },
  { label: "Online", params: { category: "online" } },
  { label: "% Discount", params: { offerType: "percentage" } },
  { label: "Cashback", params: { offerType: "cashback" } },
  { label: "Fuel", params: { category: "fuel" } },
  { label: "Travel", params: { category: "travel" } },
];

interface Props {
  initialQuery?: string;
}

export function SearchDrawer({ initialQuery = "" }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(initialQuery);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Ctrl+S / ⌘S opens / closes the drawer
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  function navigate(params: Record<string, string | null>) {
    const p = new URLSearchParams(searchParams.toString());
    Object.entries(params).forEach(([k, v]) => {
      if (v) p.set(k, v);
      else p.delete(k);
    });
    p.delete("page");
    const qs = p.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
    setOpen(false);
  }

  function handleSearch() {
    navigate({ q: query.trim() || null });
  }

  function handleQuickSearch(q: string) {
    setQuery(q);
    navigate({ q });
  }

  function handleJump(params: Record<string, string>) {
    navigate(params as Record<string, string | null>);
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          data-testid="search-drawer-trigger"
          className="flex h-9 items-center gap-2 rounded-full px-4 text-sm text-muted-foreground"
          aria-label="Open search"
        >
          <Search className="size-3.5 shrink-0" aria-hidden />
          <span className="hidden sm:inline">Search</span>
          <kbd className="ml-1 hidden items-center gap-0.5 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] sm:flex">
            Ctrl+S
          </kbd>
        </Button>
      </SheetTrigger>

      <SheetContent
        side="top"
        className="max-h-[80vh] overflow-y-auto p-0"
        showCloseButton={false}
      >
        <SheetHeader className="border-b px-6 py-5">
          <SheetTitle className="sr-only">Search offers</SheetTitle>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              autoFocus
              data-testid="search-drawer-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Search offers, merchants, banks..."
              className="h-12 rounded-full pl-11 pr-28 text-sm"
              aria-label="Search"
            />
            <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
              {query && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setQuery("")}
                  className="size-8 text-muted-foreground"
                  aria-label="Clear input"
                >
                  <X className="size-3.5" />
                </Button>
              )}
              <Button
                size="sm"
                onClick={handleSearch}
                data-testid="search-drawer-submit"
                className="h-8 rounded-full px-4"
              >
                Search
              </Button>
            </div>
          </div>
        </SheetHeader>

        <div className="space-y-5 px-6 py-5">
          {/* Popular searches */}
          <div>
            <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <TrendingUp className="size-3" aria-hidden />
              Popular searches
            </p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Popular search suggestions">
              {QUICK_SEARCHES.map((q) => (
                <button
                  key={q}
                  type="button"
                  data-testid={`quick-search-${q.replace(/\s+/g, "-")}`}
                  onClick={() => handleQuickSearch(q)}
                  className="rounded-full border border-border bg-background px-3.5 py-1.5 text-sm text-foreground transition-colors hover:bg-accent"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          <Separator />

          {/* Jump to category */}
          <div>
            <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <LayoutGrid className="size-3" aria-hidden />
              Jump to category
            </p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Category shortcuts">
              {FILTER_JUMPS.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  data-testid={`jump-${item.label.toLowerCase().replace(/[^a-z0-9]/g, "-")}`}
                  onClick={() => handleJump(item.params)}
                  className="rounded-full bg-secondary px-3.5 py-1.5 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
