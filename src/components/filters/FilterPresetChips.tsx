"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Bookmark, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useFilterPresets } from "@/hooks/useFilterPresets";
import type { FilterPreset } from "@/hooks/useFilterPresets";

const FILTER_KEYS = [
  "bank",
  "category",
  "offerType",
  "sort",
  "activeFrom",
  "activeTo",
] as const;

function presetMatchesUrl(
  preset: FilterPreset,
  searchParams: URLSearchParams,
): boolean {
  for (const key of FILTER_KEYS) {
    const current = searchParams.get(key) ?? undefined;
    const saved = preset.filters[key];
    if (current !== saved) return false;
  }
  return true;
}

export function FilterPresetChips() {
  const [mounted, setMounted] = useState(false);
  const { presets, deletePreset } = useFilterPresets();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Standard Next.js client-only mount guard — prevents SSR hydration mismatch for localStorage content.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  if (!mounted || presets.length === 0) return null;

  function applyPreset(preset: FilterPreset) {
    const params = new URLSearchParams();
    for (const key of FILTER_KEYS) {
      const val = preset.filters[key];
      if (val) params.set(key, val);
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div
      data-testid="filter-preset-chips"
      className="mb-4 flex flex-wrap items-center gap-2"
    >
      {presets.map((preset) => {
        const active = presetMatchesUrl(preset, searchParams);
        return (
          <Badge
            key={preset.id}
            data-testid={`preset-chip-${preset.id}`}
            variant={active ? "default" : "secondary"}
            className="flex h-9 cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-1 text-sm font-medium transition-colors"
          >
            <button
              type="button"
              className="flex items-center gap-1.5"
              onClick={() => applyPreset(preset)}
              aria-pressed={active}
              aria-label={`Apply preset: ${preset.name}`}
              data-testid={`preset-apply-${preset.id}`}
            >
              <Bookmark className="size-3.5 shrink-0" aria-hidden />
              {preset.name}
            </button>
            <button
              type="button"
              onClick={() => deletePreset(preset.id)}
              className="ml-0.5 rounded-full p-0.5 hover:bg-foreground/10"
              aria-label={`Delete preset: ${preset.name}`}
              data-testid={`preset-delete-${preset.id}`}
            >
              <X className="size-3" />
            </button>
          </Badge>
        );
      })}
    </div>
  );
}
