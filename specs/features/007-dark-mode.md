# Feature: Dark Mode (007)

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [x] Implementation started
- [x] Tests written
- [x] Done

## Purpose
Give users a dark colour scheme option that reduces eye strain in low-light environments
and respects the OS-level dark mode preference on first visit.

## User Story
As a user who prefers dark interfaces, I want to toggle dark mode and have my preference
remembered across sessions so that the site always appears in my chosen theme.

## Scope

### In Scope
- `next-themes` ThemeProvider wrapping `<body>` in `layout.tsx`
- System preference auto-applied on first visit (`enableSystem={true}`)
- Manual toggle in the header (light / dark / system)
- User choice persisted in localStorage via next-themes
- No SSR flash (next-themes injects an inline script before page paint)
- All components already use shadcn semantic tokens — no per-component colour changes needed

### Out of Scope
- Per-page or per-component theme overrides
- High-contrast accessibility mode
- Custom theme colours (e.g. sepia)

## Data Contract
Theme stored in localStorage key `theme` (managed by next-themes).
Values: `"light"` | `"dark"` | `"system"`.

## API Contract
No API changes.

## Technical Approach

### 1. Install next-themes
```bash
npm install next-themes
```

### 2. Wrap layout (`src/app/layout.tsx`)
```tsx
import { ThemeProvider } from 'next-themes';

// In <body>:
<ThemeProvider
  attribute="class"          // adds/removes 'dark' class on <html>
  defaultTheme="system"      // respect OS preference on first visit
  enableSystem={true}
  storageKey="theme"
  disableTransitionOnChange  // prevents colour flash during switch
>
  {children}
</ThemeProvider>
```

Add `suppressHydrationWarning` to `<html>` to silence the hydration mismatch warning
caused by next-themes setting the class server-side vs client-side.

### 3. Theme toggle component (`src/components/layout/ThemeToggle.tsx`)
```tsx
'use client';
import { useTheme } from 'next-themes';
import { Sun, Moon, Monitor } from 'lucide-react';
// Render only after mount (useEffect) to prevent SSR mismatch
// Button cycles: light → dark → system → light
// data-testid="theme-toggle"
```

### 4. Add to header in `src/app/page.tsx`
Add `<ThemeToggle />` to the header nav row.

### 5. Tailwind dark mode
`tailwind.config.ts` already uses `darkMode: "class"` (shadcn default).
No changes needed.

### CSS variable dark theme
shadcn/ui generates dark-mode overrides in `globals.css` under `.dark { ... }`.
All semantic tokens (`--background`, `--foreground`, `--primary`, etc.) flip automatically.

## Acceptance Criteria
- [ ] AC1: `ThemeProvider` wraps the app with `attribute="class"` and `enableSystem={true}`
- [ ] AC2: First visit uses system preference (dark if OS is dark, light otherwise)
- [ ] AC3: Theme toggle visible in the header on all screen sizes
- [ ] AC4: Clicking toggle cycles through light → dark → system modes
- [ ] AC5: Choice persisted in localStorage; correct theme applied on next page load
- [ ] AC6: No flash of unstyled content (FOUC) on page load in dark mode
- [ ] AC7: All existing components render correctly in dark mode (no hardcoded colours)
- [ ] AC8: `data-testid="theme-toggle"` present on the toggle button

## Test Cases

| Test | Type | AC |
|------|------|----|
| ThemeToggle renders after mount | component | AC3, AC8 |
| Clicking toggle calls setTheme | component | AC4 |
| Dark class applied to html element when theme=dark | e2e | AC1 |
| No FOUC — html has dark class before first paint | e2e | AC6 |

## Edge Cases
- localStorage unavailable (incognito, storage blocked) → next-themes falls back to system preference gracefully
- Server-side rendering: next-themes sets the class via an inline `<script>` before React hydrates, preventing flash
- System preference changes mid-session → if user is on "system" mode, theme updates dynamically via `prefers-color-scheme` media query listener (next-themes handles this)
- Images: OfferImage uses CSS gradients and Lucide icons which already respond to dark tokens; no explicit dark-mode handling needed for images

## Notes
- `suppressHydrationWarning` on `<html>` is required to silence a harmless warning caused by next-themes modifying the class server-side vs client-side
- `disableTransitionOnChange` prevents a brief colour animation when switching themes (matches shadcn recommendation)
- The toggle renders nothing until mounted (`useEffect`) to prevent hydration mismatches — show a placeholder (16×16 invisible box) to avoid layout shift
- Package: `next-themes` v0.4+ supports Next.js App Router natively
