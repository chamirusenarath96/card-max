"use client";

import { useState, useEffect, useCallback } from "react";

export interface FilterPreset {
  id: string;
  name: string;
  createdAt: string;
  filters: {
    bank?: string;
    category?: string;
    offerType?: string;
    sort?: string;
    activeFrom?: string;
    activeTo?: string;
  };
}

const STORAGE_KEY = "card-max:filter-presets";
const MAX_PRESETS = 10;

function readFromStorage(): FilterPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeToStorage(presets: FilterPreset[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  } catch {
    // QuotaExceededError or storage unavailable — silently ignore
  }
}

export function useFilterPresets() {
  const [presets, setPresets] = useState<FilterPreset[]>([]);

  useEffect(() => {
    // localStorage is a synchronous external system; reading on mount (not SSR) avoids hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPresets(readFromStorage());
  }, []);

  const savePreset = useCallback(
    (name: string, filters: FilterPreset["filters"]) => {
      const newPreset: FilterPreset = {
        id: crypto.randomUUID(),
        name: name.trim().slice(0, 32),
        createdAt: new Date().toISOString(),
        filters,
      };
      setPresets((prev) => {
        const next = [newPreset, ...prev].slice(0, MAX_PRESETS);
        writeToStorage(next);
        return next;
      });
    },
    [],
  );

  const deletePreset = useCallback((id: string) => {
    setPresets((prev) => {
      const next = prev.filter((p) => p.id !== id);
      writeToStorage(next);
      return next;
    });
  }, []);

  return { presets, savePreset, deletePreset };
}
