import { cn } from "@/lib/utils";

interface LogoProps {
  variant?: "horizontal" | "stacked";
  className?: string;
}

const FONT_BOLD = "'Helvetica Neue', 'Arial Black', Arial, sans-serif";
const FONT_REGULAR = "'Helvetica Neue', Arial, sans-serif";

export function Logo({ variant = "horizontal", className }: LogoProps) {
  if (variant === "stacked") {
    return (
      <svg
        viewBox="0 0 400 320"
        aria-label="CardMax"
        className={cn("h-32 w-auto text-foreground", className)}
      >
        {/* Card fan — back */}
        <g transform="translate(164, 32) rotate(-12)">
          <rect x="0" y="0" width="72" height="46" rx="5" fill="currentColor" opacity="0.15" />
        </g>
        {/* Card fan — mid */}
        <g transform="translate(164, 32) rotate(-4)">
          <rect x="0" y="0" width="72" height="46" rx="5" fill="currentColor" opacity="0.35" />
        </g>
        {/* Card fan — front */}
        <g transform="translate(164, 32) rotate(6)">
          <rect x="0" y="0" width="72" height="46" rx="5" fill="none" stroke="currentColor" strokeWidth="2" />
          <rect x="8" y="8" width="14" height="10" rx="2" fill="currentColor" opacity="0.35" />
          <rect x="0" y="28" width="72" height="10" fill="currentColor" opacity="0.12" />
        </g>
        {/* Wordmark */}
        <text
          x="200" y="178"
          fontFamily={FONT_BOLD}
          fontSize="80"
          fontWeight="900"
          fill="currentColor"
          textAnchor="middle"
          letterSpacing="-2"
        >
          CARD
        </text>
        <text
          x="200" y="248"
          fontFamily={FONT_BOLD}
          fontSize="80"
          fontWeight="900"
          fill="currentColor"
          textAnchor="middle"
          letterSpacing="-2"
        >
          MAX
        </text>
        {/* Rule */}
        <line x1="60" y1="260" x2="340" y2="260" stroke="currentColor" strokeWidth="1" opacity="0.2" />
        {/* Slogan */}
        <text
          x="200" y="282"
          fontFamily={FONT_REGULAR}
          fontSize="14"
          fontWeight="400"
          fill="currentColor"
          textAnchor="middle"
          letterSpacing="4"
          opacity="0.45"
        >
          FIND THE BEST CARD DEALS
        </text>
      </svg>
    );
  }

  // horizontal (default) — used in headers and sidebars
  return (
    <svg
      viewBox="0 0 560 100"
      aria-label="CardMax"
      className={cn("h-8 w-auto text-foreground", className)}
    >
      {/* Card fan — back */}
      <g transform="translate(20, 50) rotate(-10)" opacity="0.3">
        <rect x="0" y="-20" width="46" height="30" rx="4" fill="currentColor" />
      </g>
      {/* Card fan — mid */}
      <g transform="translate(20, 50) rotate(-3)" opacity="0.6">
        <rect x="0" y="-20" width="46" height="30" rx="4" fill="currentColor" />
      </g>
      {/* Card fan — front */}
      <g transform="translate(20, 50) rotate(6)">
        <rect x="0" y="-20" width="46" height="30" rx="4" fill="currentColor" />
        <rect x="4" y="-16" width="9" height="7" rx="1.5" fill="white" opacity="0.4" />
      </g>
      {/* Vertical rule */}
      <line x1="84" y1="18" x2="84" y2="82" stroke="currentColor" strokeWidth="0.8" opacity="0.3" />
      {/* Wordmark */}
      <text
        x="100" y="62"
        fontFamily={FONT_BOLD}
        fontSize="46"
        fontWeight="900"
        fill="currentColor"
        letterSpacing="-1"
      >
        CARD MAX
      </text>
      {/* Slogan */}
      <text
        x="100" y="82"
        fontFamily={FONT_REGULAR}
        fontSize="12"
        fontWeight="400"
        fill="currentColor"
        letterSpacing="3.5"
        opacity="0.45"
      >
        FIND THE BEST CARD DEALS
      </text>
    </svg>
  );
}
