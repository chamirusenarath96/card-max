/**
 * Renders a discount label with the numeric percentage highlighted in
 * a vivid accent colour and the descriptor word in a softer tone.
 *
 * Examples:
 *   "15% OFF"         →  [15%] [OFF]
 *   "10% CASHBACK"    →  [10%] [CASHBACK]
 *   "BUY 1 GET 1"     →  [BUY 1 GET 1]   (no split — rendered uniformly)
 *   "INSTALLMENT"     →  [INSTALLMENT]   (no split)
 */

import { cn } from "@/lib/utils";

interface Props {
  /** The full label, e.g. "15% OFF", "BUY 1 GET 1", "INSTALLMENT" */
  label: string;
  /** Size variant — maps to Tailwind text-size classes */
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE = {
  sm: { num: "text-base",  word: "text-xs"  },
  md: { num: "text-xl",    word: "text-sm"  },
  lg: { num: "text-3xl",   word: "text-base" },
} as const;

/**
 * Split "15% OFF" → { num: "15%", word: "OFF" }
 * Returns null if the label doesn't start with a percentage.
 */
function splitLabel(label: string): { num: string; word: string } | null {
  const match = label.match(/^(\d+(?:\.\d+)?%)\s*(.*)$/);
  if (!match) return null;
  return { num: match[1]!, word: match[2]!.trim() };
}

export function DiscountDisplay({ label, size = "md", className }: Props) {
  const sizes = SIZE[size];
  const parts = splitLabel(label);

  if (!parts) {
    // No percentage — render the whole label in primary colour
    return (
      <p
        className={cn(
          sizes.num,
          "font-extrabold tracking-tight text-primary",
          className,
        )}
        data-testid="offer-discount"
      >
        {label}
      </p>
    );
  }

  return (
    <p
      className={cn("flex items-baseline gap-1 font-extrabold tracking-tight", className)}
      data-testid="offer-discount"
    >
      {/* Percentage number — vivid primary green */}
      <span className={cn(sizes.num, "text-primary")}>{parts.num}</span>
      {/* Descriptor word — softer foreground so the number pops */}
      {parts.word && (
        <span className={cn(sizes.word, "font-semibold text-foreground/60")}>
          {parts.word}
        </span>
      )}
    </p>
  );
}
