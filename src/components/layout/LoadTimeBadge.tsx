"use client";

/**
 * LoadTimeBadge
 *
 * Displays the duration of the most recent filter/search navigation as a
 * small inline indicator (e.g. "⚡ 342ms"). Reads `lastNavMs` from
 * NavigationProgressContext, so it updates automatically after every
 * `navigate()` call. Hidden on initial page load (before any navigation).
 */

import { useNavigationProgress } from "./NavigationProgressContext";

export function LoadTimeBadge() {
  const { isPending, lastNavMs } = useNavigationProgress();

  // Don't render while navigating or if no navigation has happened yet.
  if (lastNavMs === null || isPending) return null;

  return (
    <span
      className="text-xs text-muted-foreground/60"
      data-testid="load-time-badge"
      aria-label={`Last navigation completed in ${lastNavMs} milliseconds`}
    >
      ⚡ {lastNavMs}ms
    </span>
  );
}
