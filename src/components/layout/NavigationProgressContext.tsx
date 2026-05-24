"use client";

/**
 * NavigationProgressContext
 *
 * Provides a `navigate(url)` helper that wraps `router.push()` inside React's
 * `startTransition`. Consumers can read `isPending` to show loading UI while
 * the RSC payload is in-flight, and `lastNavMs` to display the most recent
 * navigation duration (milliseconds).
 *
 * Usage:
 *   const { navigate, isPending, lastNavMs } = useNavigationProgress();
 *   navigate("/?bank=hnb");
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";

interface NavigationProgressContextValue {
  /** True while the RSC payload is in-flight after calling `navigate()`. */
  isPending: boolean;
  /** Duration of the last completed navigation in milliseconds, or null on first load. */
  lastNavMs: number | null;
  /** Navigate to a URL, showing the global progress indicator during transit. */
  navigate: (url: string) => void;
}

const NavigationProgressContext = createContext<NavigationProgressContextValue>({
  isPending: false,
  lastNavMs: null,
  navigate: () => {},
});

export function NavigationProgressProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const [lastNavMs, setLastNavMs] = useState<number | null>(null);
  const navStartRef = useRef<number | null>(null);

  // Track start and end of each navigation to compute duration.
  useEffect(() => {
    if (isPending) {
      navStartRef.current = performance.now();
    } else if (navStartRef.current !== null) {
      setLastNavMs(Math.round(performance.now() - navStartRef.current));
      navStartRef.current = null;
    }
  }, [isPending]);

  const navigate = useCallback(
    (url: string) => {
      startTransition(() => {
        router.push(url);
      });
    },
    [router],
  );

  return (
    <NavigationProgressContext.Provider value={{ isPending, lastNavMs, navigate }}>
      {children}
    </NavigationProgressContext.Provider>
  );
}

export function useNavigationProgress(): NavigationProgressContextValue {
  return useContext(NavigationProgressContext);
}
