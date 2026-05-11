"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";

type GridPosition = "above" | "visible" | "below";

export function ScrollControls() {
  const [gridPosition, setGridPosition] = useState<GridPosition>("below");
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("IntersectionObserver" in window)) return;

    const grid = document.querySelector('[data-testid="offer-grid"]');
    if (!grid) return;

    observerRef.current = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (entry.isIntersecting) {
          setGridPosition("visible");
        } else if (entry.boundingClientRect.top > 0) {
          setGridPosition("below");
        } else {
          setGridPosition("above");
        }
      },
      { threshold: 0 },
    );

    observerRef.current.observe(grid);
    return () => observerRef.current?.disconnect();
  }, []);

  function scrollToGrid() {
    const grid = document.querySelector('[data-testid="offer-grid"]');
    grid?.scrollIntoView({ behavior: "smooth" });
  }

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const showDown = gridPosition === "below";
  const showUp = gridPosition === "above";

  return (
    <div className="fixed bottom-6 right-6 z-50 hidden flex-col gap-2 sm:flex">
      <Button
        variant="secondary"
        size="icon"
        data-testid="scroll-to-grid-btn"
        onClick={scrollToGrid}
        aria-label="Scroll to offers"
        tabIndex={showDown ? 0 : -1}
        className={`transition-opacity duration-300 ${showDown ? "opacity-100" : "pointer-events-none opacity-0"}`}
      >
        <ChevronDown className="size-4" />
      </Button>
      <Button
        variant="secondary"
        size="icon"
        data-testid="scroll-to-top-btn"
        onClick={scrollToTop}
        aria-label="Scroll to top"
        tabIndex={showUp ? 0 : -1}
        className={`transition-opacity duration-300 ${showUp ? "opacity-100" : "pointer-events-none opacity-0"}`}
      >
        <ChevronUp className="size-4" />
      </Button>
    </div>
  );
}
