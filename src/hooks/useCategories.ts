"use client";

/**
 * useCategories — fetches /api/categories and returns the result.
 *
 * A module-level promise cache deduplicates concurrent fetches so
 * FilterDrawer and SearchDrawer (both mounted on the same page) share
 * a single in-flight request and its result without needing SWR.
 *
 * Cache is intentionally never invalidated within a page session — the
 * category list changes at most once per crawler run (every 24 h).
 */
import { useState, useEffect } from "react";

export interface CategoryItem {
  category: string;
  label: string;
  count: number;
}

export interface UseCategoriesResult {
  data: CategoryItem[];
  isLoading: boolean;
  error: boolean;
}

// Module-level cache shared across all hook instances in the same page session.
let _cachedData: CategoryItem[] | null = null;
let _pendingPromise: Promise<CategoryItem[]> | null = null;

async function doFetch(): Promise<CategoryItem[]> {
  const res = await fetch("/api/categories");
  if (!res.ok) return [];
  const json = (await res.json()) as { data?: CategoryItem[] };
  return json.data ?? [];
}

/** Reset the module cache — exported for test teardown only. */
export function _resetCategoryCache() {
  _cachedData = null;
  _pendingPromise = null;
}

export function useCategories(): UseCategoriesResult {
  const [state, setState] = useState<UseCategoriesResult>(() => ({
    data: _cachedData ?? [],
    isLoading: _cachedData === null,
    error: false,
  }));

  useEffect(() => {
    // Cache was already populated when this component mounted — the useState
    // initializer already set the correct state, so nothing to do.
    if (_cachedData !== null) return;

    // Start a shared fetch if one isn't already in flight.
    if (!_pendingPromise) {
      _pendingPromise = doFetch();
    }

    let cancelled = false;
    _pendingPromise
      .then((data) => {
        _cachedData = data;
        if (!cancelled) setState({ data, isLoading: false, error: false });
      })
      .catch(() => {
        if (!cancelled) setState({ data: [], isLoading: false, error: true });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
