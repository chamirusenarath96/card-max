/**
 * Debounced, abort-safe hook that fetches offer previews while the user types.
 * Uses the existing /api/offers endpoint — no new API route needed.
 *
 * Only fires when query.trim().length >= MIN_CHARS.
 * Cancels the previous in-flight request on every new keystroke.
 */
"use client";

import { useEffect, useRef, useState } from "react";

const MIN_CHARS = 2;
const DEBOUNCE_MS = 300;

export interface SuggestionItem {
  _id: string;
  title: string;
  merchant: string;
  bank: string;
  bankDisplayName: string;
  discountLabel?: string;
  category: string;
  offerType: string;
}

export function useSearchSuggestions(query: string) {
  const [results, setResults] = useState<SuggestionItem[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Cancel previous debounce + in-flight request
    if (timerRef.current) clearTimeout(timerRef.current);
    if (abortRef.current) abortRef.current.abort();

    const trimmed = query.trim();

    if (trimmed.length < MIN_CHARS) {
      setResults([]);
      setTotal(0);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    timerRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const qs = new URLSearchParams({ q: trimmed, limit: "6" });
        const res = await fetch(`/api/offers?${qs}`, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        setResults(json.data ?? []);
        setTotal(json.pagination?.total ?? 0);
      } catch (err: unknown) {
        // Ignore abort errors — they are expected on rapid typing
        if (err instanceof Error && err.name !== "AbortError") {
          setResults([]);
          setTotal(0);
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [query]);

  const isActive = query.trim().length >= MIN_CHARS;

  return { results, total, isLoading, isActive };
}
