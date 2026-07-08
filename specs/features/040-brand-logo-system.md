# Feature: CardMax Brand & Logo System (040)

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [x] Implementation started
- [ ] Tests written
- [x] Done

## Purpose
Give the product a consistent, theme-aware brand identity — a single logo component
usable across header, footer, sidebar, and login page, plus a matching browser favicon
— replacing any ad-hoc text wordmark or placeholder icon.

## User Story
As a visitor, I want to see a consistent CardMax logo and favicon across every page and
in both light and dark mode so that the product feels polished and recognisable.

## Scope

### In Scope
- `Logo.tsx` — single inline SVG React component with two variants:
  - `horizontal` (560×100 viewBox) — wordmark + slogan, used in header/footer/sidebar
  - `stacked` (400×320 viewBox) — icon + wordmark stacked, used on `/login`
- `currentColor` fill throughout so the logo adapts automatically to light/dark theme
  with no separate light/dark asset files
- `icon.svg` — browser favicon: dark rounded-rect background, card-fan graphic, "CM"
  monogram — placed at `src/app/icon.svg` (Next.js auto-detected favicon convention)
- Explicit `icons` metadata block in `src/app/layout.tsx` (`icon`, `shortcut`, `apple`
  all pointing at `/icon.svg`) for broader browser/OS support than auto-detection alone
- Card-fan motif (three overlapping rounded rects) shared visually between `Logo` and
  `icon.svg` for brand consistency

### Out of Scope
- PNG/ICO fallback favicons for legacy browsers that don't support SVG favicons
- Animated logo / loading-state variants
- Social share image (`opengraph-image`) — not implemented, no spec coverage yet
- A dedicated brand style guide document (colours, spacing rules are implicit in the
  component, not written up separately)

## Data Contract
No schema or database changes. Pure presentational component — no props beyond
`variant` and `className`.

## API Contract
No new endpoints.

## Technical Approach

`Logo.tsx` is a shared component, not a page — closest applicable command is
`/new-page`, whose component-extraction, tests, and design-token conventions (steps
4–6) apply even though this isn't a route itself.

### Component file: `src/components/brand/Logo.tsx`
```tsx
interface LogoProps {
  variant?: "horizontal" | "stacked";
  className?: string;
}
export function Logo({ variant = "horizontal", className }: LogoProps) { ... }
```
- Both variants are raw `<svg>` with `role="img"` and `aria-label="CardMax"`
- `fill="currentColor"` on every shape → colour is inherited from `text-foreground`
  (or whatever text colour class the caller applies), so dark mode requires zero
  logo-specific code (per `/new-page` step 4: "never hardcode colours")
- Font stack: `'Helvetica Neue', 'Arial Black', Arial, sans-serif` (bold wordmark),
  `'Helvetica Neue', Arial, sans-serif` (regular slogan/subtitle)
- `horizontal`: card-fan glyph (3 overlapping `rect`s at increasing opacity) + "CARD
  MAX" wordmark + "FIND THE BEST CARD DEALS" slogan, sized for `h-8` header use
- `stacked`: same card-fan glyph, larger, above a two-line "CARD" / "MAX" wordmark +
  slogan + a horizontal rule; sized for `h-28`–`h-32` login-page use

### Favicon: `src/app/icon.svg`
Next.js App Router auto-picks up `src/app/icon.svg` as the default favicon. This
project additionally sets explicit metadata in `src/app/layout.tsx` for broader
support:
```tsx
export const metadata: Metadata = {
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
};
```

### Usage sites
- Header nav (`src/app/page.tsx`) — `<Logo variant="horizontal" />`
- `Footer.tsx` — `<Logo variant="horizontal" />`
- `AdminSidebar.tsx` — `<Logo variant="horizontal" />` (collapsed/expanded states)
- `/login` (`src/app/login/page.tsx`) — `<Logo variant="stacked" className="mx-auto mb-4 h-28" />`

### Component test (per `/new-page` step 6 — currently missing, see Notes)
```tsx
import { render, screen } from "@/test-utils";
import { describe, it, expect } from "vitest";
import { Logo } from "./Logo";

describe("Logo", () => {
  it("renders horizontal variant by default", () => {
    render(<Logo />);
    expect(screen.getByRole("img", { name: "CardMax" })).toBeInTheDocument();
  });

  it("renders stacked variant when specified", () => {
    render(<Logo variant="stacked" />);
    const svg = screen.getByRole("img", { name: "CardMax" });
    expect(svg).toHaveAttribute("viewBox", "0 0 400 320");
  });
});
```

## Acceptance Criteria
- [x] AC1: `Logo` component renders a `horizontal` variant by default with `role="img"`
      and `aria-label="CardMax"`
- [x] AC2: `Logo` renders a `stacked` variant when `variant="stacked"` is passed
- [x] AC3: All shapes use `fill="currentColor"` — no hardcoded hex colours in the SVG
- [x] AC4: `Logo` is used in header, footer, admin sidebar, and login page
- [x] AC5: `src/app/icon.svg` exists and is a valid SVG favicon
- [x] AC6: `layout.tsx` sets explicit `icons` metadata (`icon`, `shortcut`, `apple`)
      pointing at `/icon.svg`
- [ ] AC7: `Logo.tsx` has a colocated `Logo.test.tsx` (currently missing — gap)

## Test Cases

| Test | Type | AC |
|------|------|----|
| Logo renders with default horizontal variant and correct aria-label | component | AC1 |
| Logo renders stacked variant with correct viewBox | component | AC2 |
| Logo SVG contains no hex-color fill attributes | component | AC3 |
| header renders Logo | component | AC4 |
| Footer renders Logo | component | AC4 |
| icon.svg is served at /icon.svg and is valid SVG | e2e | AC5 |
| layout metadata icons block matches expected shape | unit | AC6 |

## Edge Cases
- `className` prop conflicts with the component's own sizing classes (`h-8` /
  `h-32`) — `cn()` from `@/lib/utils` merges them via Tailwind's class-merge
  precedence, so a caller-supplied height (e.g. `h-28` on the login page) correctly
  overrides the component default
- SVG favicon unsupported (very old browsers / some crawlers) — no PNG/ICO fallback is
  configured; acceptable given the project's target audience (modern browsers only)
- Dark mode toggle — `currentColor` means the logo needs no re-render logic; it just
  inherits whatever `text-foreground` resolves to under the active theme

## Notes
- Implementation: no command exactly matches "shared branding component" — use
  `/new-page` for the component-extraction, colocated-test, and design-token
  conventions (steps 4–6), since `Logo.tsx` is consumed by page-level layouts
- This spec was written retroactively — the feature is already implemented and listed
  under "Recently completed" in the README roadmap, but had no spec file. AC7 is
  marked incomplete to flag the missing test file for a future cleanup pass
- The card-fan motif is intentionally reused between `Logo` and `icon.svg` so the
  favicon reads as "the same brand" at 16px as the full wordmark does at 32px+
