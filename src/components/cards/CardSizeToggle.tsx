"use client";

import { LayoutGrid, LayoutList, AlignJustify } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { CardSize } from "./offer-card-shared";

interface Props {
  size: CardSize;
  onChange: (size: CardSize) => void;
}

const SIZES: { value: CardSize; label: string; icon: React.ReactNode }[] = [
  {
    value: "compact",
    label: "Compact",
    icon: <LayoutList className="size-4" aria-hidden />,
  },
  {
    value: "default",
    label: "Grid",
    icon: <LayoutGrid className="size-4" aria-hidden />,
  },
  {
    value: "expanded",
    label: "Expanded",
    icon: <AlignJustify className="size-4" aria-hidden />,
  },
];

export function CardSizeToggle({ size, onChange }: Props) {
  return (
    <ToggleGroup
      type="single"
      value={size}
      onValueChange={(v) => {
        if (v) onChange(v as CardSize);
      }}
      variant="outline"
      spacing={0}
      data-testid="card-size-toggle"
      role="radiogroup"
      aria-label="Card size"
      className="gap-0 rounded-lg border border-border bg-muted/50 p-1"
    >
      {SIZES.map((s) => (
        <Tooltip key={s.value}>
          <TooltipTrigger asChild>
            <ToggleGroupItem
              value={s.value}
              data-testid={`size-${s.value}`}
              aria-label={s.label}
              className="h-auto gap-1.5 rounded-md px-3 py-2 text-xs font-medium data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm"
            >
              {s.icon}
              <span className="hidden sm:inline">{s.label}</span>
            </ToggleGroupItem>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>{s.label} view</p>
          </TooltipContent>
        </Tooltip>
      ))}
    </ToggleGroup>
  );
}
