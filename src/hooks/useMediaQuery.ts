"use client";

import { useSyncExternalStore } from "react";

function subscribe(query: string) {
  return (callback: () => void) => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return () => {};
    }
    const mediaQueryList = window.matchMedia(query);
    mediaQueryList.addEventListener("change", callback);
    return () => mediaQueryList.removeEventListener("change", callback);
  };
}

function getSnapshot(query: string): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(query).matches;
}

function getServerSnapshot(): boolean {
  return false;
}

/** Tracks whether a CSS media query currently matches, updating live on change. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(subscribe(query), () => getSnapshot(query), getServerSnapshot);
}
