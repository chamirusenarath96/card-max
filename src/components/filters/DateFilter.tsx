"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState } from "react";
import { CalendarIcon, X } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

interface Props {
  activeFrom?: string;
  activeTo?: string;
}

function toDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return isNaN(d.getTime()) ? undefined : d;
}

function toISODate(date: Date | undefined): string | null {
  if (!date) return null;
  return format(date, "yyyy-MM-dd");
}

export function DateFilter({ activeFrom, activeTo }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [fromOpen, setFromOpen] = useState(false);
  const [toOpen, setToOpen] = useState(false);

  const fromDate = toDate(activeFrom);
  const toDate_ = toDate(activeTo);

  function setDateParams(from: string | null, to: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (from) params.set("activeFrom", from); else params.delete("activeFrom");
    if (to) params.set("activeTo", to); else params.delete("activeTo");
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function handleFromSelect(date: Date | undefined) {
    setFromOpen(false);
    setDateParams(toISODate(date), activeTo ?? null);
  }

  function handleToSelect(date: Date | undefined) {
    setToOpen(false);
    setDateParams(activeFrom ?? null, toISODate(date));
  }

  function handleClear() {
    setDateParams(null, null);
  }

  const hasDateFilter = !!activeFrom || !!activeTo;

  return (
    <div data-testid="date-filter">
      <Label className="mb-4 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Date Filter
      </Label>

      <div className="inline-flex max-w-full items-stretch overflow-hidden rounded-lg border bg-card shadow-sm">
        {/* From picker */}
        <Popover open={fromOpen} onOpenChange={setFromOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              data-testid="date-from-trigger"
              className={cn(
                "h-auto min-h-[52px] flex-col items-start gap-0.5 rounded-none border-0 px-4 py-3 text-left shadow-none hover:bg-accent",
                !fromDate && "text-muted-foreground",
              )}
            >
              <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                <CalendarIcon className="size-3" aria-hidden />
                From
              </span>
              <span className="text-sm font-medium">
                {fromDate ? format(fromDate, "dd MMM yyyy") : "Pick a date"}
              </span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={fromDate}
              onSelect={handleFromSelect}
              toDate={toDate_}
              captionLayout="dropdown"
              initialFocus
            />
          </PopoverContent>
        </Popover>

        <Separator orientation="vertical" className="min-h-[52px] self-stretch" />

        {/* To picker */}
        <Popover open={toOpen} onOpenChange={setToOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              data-testid="date-to-trigger"
              className={cn(
                "h-auto min-h-[52px] flex-col items-start gap-0.5 rounded-none border-0 px-4 py-3 text-left shadow-none hover:bg-accent",
                !toDate_ && "text-muted-foreground",
              )}
            >
              <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                <CalendarIcon className="size-3" aria-hidden />
                To
              </span>
              <span className="text-sm font-medium">
                {toDate_ ? format(toDate_, "dd MMM yyyy") : "Pick a date"}
              </span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={toDate_}
              onSelect={handleToSelect}
              fromDate={fromDate}
              captionLayout="dropdown"
              initialFocus
            />
          </PopoverContent>
        </Popover>

        {hasDateFilter ? (
          <>
            <Separator orientation="vertical" className="min-h-[52px] self-stretch" />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              data-testid="date-clear"
              onClick={handleClear}
              className="h-auto shrink-0 rounded-none text-muted-foreground hover:text-destructive"
              aria-label="Clear dates"
            >
              <X className="size-4" />
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}
