"use client";

import { useState } from "react";
import { CalendarIcon, X } from "lucide-react";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  const [open, setOpen] = useState(false);

  const fromDate = toDate(activeFrom);
  const toDate_ = toDate(activeTo);

  const range: DateRange | undefined =
    fromDate || toDate_ ? { from: fromDate, to: toDate_ } : undefined;

  function setDateParams(from: string | null, to: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (from) params.set("activeFrom", from); else params.delete("activeFrom");
    if (to) params.set("activeTo", to); else params.delete("activeTo");
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function handleSelect(selected: DateRange | undefined) {
    setDateParams(toISODate(selected?.from), toISODate(selected?.to));
    if (selected?.from && selected?.to) {
      setOpen(false);
    }
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    setDateParams(null, null);
  }

  const hasDateFilter = !!activeFrom || !!activeTo;

  let triggerLabel = "Select date range";
  if (fromDate && toDate_) {
    triggerLabel = `${format(fromDate, "dd MMM")} – ${format(toDate_, "dd MMM yyyy")}`;
  } else if (fromDate) {
    triggerLabel = `From ${format(fromDate, "dd MMM yyyy")}`;
  } else if (toDate_) {
    triggerLabel = `Until ${format(toDate_, "dd MMM yyyy")}`;
  }

  return (
    <div data-testid="date-filter">
      <Label className="mb-3 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Date Range
      </Label>

      <div className="flex items-center gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              data-testid="date-range-trigger"
              className={cn(
                "h-auto min-h-[44px] justify-start gap-2 rounded-lg px-4 py-2.5 text-left font-normal",
                !hasDateFilter && "text-muted-foreground",
              )}
            >
              <CalendarIcon className="size-4 shrink-0" aria-hidden />
              <span className="text-sm">{triggerLabel}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              numberOfMonths={2}
              selected={range}
              onSelect={handleSelect}
              captionLayout="dropdown"
              initialFocus
            />
          </PopoverContent>
        </Popover>

        {hasDateFilter && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            data-testid="date-clear"
            onClick={handleClear}
            className="size-9 shrink-0 text-muted-foreground hover:text-destructive"
            aria-label="Clear date range"
          >
            <X className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
