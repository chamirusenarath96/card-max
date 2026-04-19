"use client";

import { useState } from "react";
import { BookmarkPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { FilterPreset } from "@/hooks/useFilterPresets";

interface Props {
  filters: FilterPreset["filters"];
  onSave: (name: string, filters: FilterPreset["filters"]) => void;
}

export function SavePresetPopover({ filters, onSave }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave(trimmed, filters);
    setName("");
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleSave();
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-testid="save-preset-button"
          className="h-9 gap-1.5 rounded-full px-3 text-sm font-medium"
          aria-label="Save current filters as a preset"
        >
          <BookmarkPlus className="size-4" aria-hidden />
          Save filters
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 p-4"
        align="end"
        data-testid="save-preset-popover"
      >
        <p className="mb-3 text-sm font-semibold text-foreground">
          Name this preset
        </p>
        <Input
          data-testid="preset-name-input"
          placeholder="e.g. HNB Dining"
          value={name}
          maxLength={32}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
        />
        <div className="mt-3 flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => { setName(""); setOpen(false); }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            data-testid="save-preset-confirm"
            onClick={handleSave}
            disabled={!name.trim()}
          >
            Save
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
