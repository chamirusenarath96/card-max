"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";

const THEMES = ["light", "dark", "system"] as const;

// useSyncExternalStore gives React the correct SSR snapshot (false) and
// client snapshot (true), avoiding the useState+useEffect hydration-mismatch
// pattern and the react-hooks/set-state-in-effect lint rule.
function useIsClient(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
}

function getNextTheme(current: string | undefined): (typeof THEMES)[number] {
  const idx = THEMES.indexOf(current as (typeof THEMES)[number]);
  return THEMES[(idx + 1) % THEMES.length];
}

function ThemeIcon({ theme }: { theme: string | undefined }) {
  if (theme === "dark") return <Moon className="size-4" />;
  if (theme === "light") return <Sun className="size-4" />;
  return <Monitor className="size-4" />;
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const isClient = useIsClient();

  // Render nothing until client-side hydration completes to prevent SSR mismatch
  if (!isClient) {
    return <div className="size-9" aria-hidden />;
  }

  const label = `Switch to ${getNextTheme(theme)} mode`;

  return (
    <Button
      variant="ghost"
      size="icon"
      data-testid="theme-toggle"
      aria-label={label}
      onClick={() => setTheme(getNextTheme(theme))}
    >
      <ThemeIcon theme={theme} />
    </Button>
  );
}
