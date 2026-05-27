# Feature 032 — Accessibility Fixes (WCAG AA Compliance)

## Status
- [x] Spec drafted
- [x] Spec reviewed
- [x] Implementation started
- [x] Tests written
- [x] Local gates passed (type-check, lint, test, build)
- [x] Done

## Source
Lighthouse CI audit (production run, May 2026) — Accessibility score 91/100.
Three distinct failure categories identified from Lighthouse LHR JSON.

## Overview
Fix three classes of WCAG 2.1 AA violations surfaced by Lighthouse:

1. **Color contrast failures** — footer text and bank-name badges fail the 4.5:1 minimum ratio
2. **ARIA attribute mismatch** — hero search `<input>` carries aria-* attributes incompatible with its implicit role
3. **Console 404 errors** — Google favicon service URLs (`t1.gstatic.com/faviconV2`) return 404 for some banks, logging browser errors that hurt the Lighthouse "Best Practices" score

## Acceptance Criteria

| AC | Description |
|----|-------------|
| AC1 | Footer tagline and footer links (Privacy, Terms, Support) achieve ≥ 4.5:1 contrast ratio against the footer background in both light and dark mode |
| AC2 | Bank-name badge on offer cards (e.g. "SAMPATH BANK") achieves ≥ 4.5:1 contrast ratio against the card background in both modes |
| AC3 | Hero search `<input>` carries no ARIA attributes that conflict with its `textbox` role; Lighthouse `aria-allowed-attr` audit passes |
| AC4 | Offer card bank logo `<img>` elements have an `onError` handler that silently swaps to a letter-avatar fallback; no 404 errors appear in the browser console for favicon requests |
| AC5 | Lighthouse Accessibility score is ≥ 95 on a warm production run |
| AC6 | All existing unit and E2E tests continue to pass |

## Implementation Notes

### AC1 — Footer contrast
- Current: `text-muted-foreground` on `bg-muted` — fails WCAG AA
- Fix: override footer links to `text-foreground` (or a custom token with sufficient contrast) inside the `<footer>` scope; adjust dark-mode token if needed
- Do NOT change the global `--muted-foreground` token — that would affect other components

### AC2 — Badge contrast
- Current: shadcn `Badge` default variant renders light-coloured text on `bg-primary` which passes on a white card, but the badge sits inside `bg-card` and the combination fails for some color themes
- Fix: add a `bank` variant to `Badge` (or use `variant="secondary"`) that enforces sufficient contrast; update all `<Badge>` usages in `OfferCard` components

### AC3 — ARIA mismatch
- Lighthouse flags: `<input type="text" data-slot="input" data-testid="hero-search-input">` carries an `aria-*` attribute incompatible with its role
- Audit the `HeroSearch` / `SearchDrawer` component for misused ARIA props; common culprit is `aria-haspopup` or `aria-expanded` on a plain `<input>` rather than the wrapping combobox container
- Correct pattern: `role="combobox"` on the wrapper `<div>`, `aria-expanded`, `aria-haspopup="listbox"` and `aria-autocomplete="list"` on the wrapper; the `<input>` itself should only have `aria-label` / `aria-labelledby`

### AC4 — Favicon 404s
- Bank logo `<img>` tags currently rely on Google's `faviconV2` service; some banks return 404
- Add `onError={(e) => { e.currentTarget.style.display = 'none'; /* show letter-avatar */ }}` or swap `src` to a local SVG letter avatar
- The letter-avatar pattern (first letter of bank name on a coloured circle) is already used elsewhere in the codebase — reuse it

## Test Cases

| # | Type | Description |
|---|------|-------------|
| T1 | unit | `Footer` renders links with class that produces ≥ 4.5:1 contrast (snapshot or class assertion) |
| T2 | unit | `OfferCard` badge uses the correct variant |
| T3 | unit | `HeroSearch` / `SearchDrawer` input does not have mismatched aria-* attributes |
| T4 | unit | Logo `<img>` has `onError` prop defined |
| T5 | e2e | No accessibility violations reported by Playwright `page.accessibility.snapshot()` for key elements |
