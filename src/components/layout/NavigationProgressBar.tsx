"use client";

/**
 * NavigationProgressBar
 *
 * Renders a thin animated bar at the very top of the viewport while a
 * Next.js RSC navigation is in-flight. Reads `isPending` from
 * NavigationProgressContext so it automatically reacts to any call to
 * `navigate()` anywhere in the component tree.
 */

import { useNavigationProgress } from "./NavigationProgressContext";

export function NavigationProgressBar() {
  const { isPending } = useNavigationProgress();

  return (
    <div
      aria-hidden
      data-testid="nav-progress-bar"
      className={`pointer-events-none fixed top-0 left-0 right-0 z-[9999] h-0.5 overflow-hidden transition-opacity duration-300 ${
        isPending ? "opacity-100" : "opacity-0"
      }`}
    >
      {/* Inner sliding segment — using absolute positioning so it stays within the overflow-hidden container */}
      <div className="absolute top-0 left-0 h-full w-1/3 bg-primary animate-nav-progress" />
    </div>
  );
}
