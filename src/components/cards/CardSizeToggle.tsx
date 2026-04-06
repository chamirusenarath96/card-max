"use client";

import type { CardSize } from "./offer-card-shared";

interface Props {
  size: CardSize;
  onChange: (size: CardSize) => void;
}

const SIZES: { value: CardSize; label: string; icon: React.ReactNode }[] = [
  {
    value: "compact",
    label: "Compact",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
      </svg>
    ),
  },
  {
    value: "default",
    label: "Grid",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
      </svg>
    ),
  },
  {
    value: "expanded",
    label: "Expanded",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
      </svg>
    ),
  },
];

export function CardSizeToggle({ size, onChange }: Props) {
  return (
    <div className="flex items-center gap-1 bg-surface-lowest rounded-xl p-1 shadow-sm" data-testid="card-size-toggle" role="radiogroup" aria-label="Card size">
      {SIZES.map((s) => (
        <button
          key={s.value}
          type="button"
          data-testid={`size-${s.value}`}
          onClick={() => onChange(s.value)}
          aria-checked={size === s.value}
          role="radio"
          title={s.label}
          className={[
            "flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors",
            size === s.value
              ? "bg-primary text-on-primary shadow-sm"
              : "text-on-surface-variant hover:bg-surface-high",
          ].join(" ")}
        >
          {s.icon}
          <span className="hidden sm:inline">{s.label}</span>
        </button>
      ))}
    </div>
  );
}
