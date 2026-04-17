# Feature: Save Filter Presets (006)

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [ ] Implementation started
- [ ] Tests written
- [ ] Done

## Purpose
Power users repeatedly apply the same filter combinations (e.g. "Commercial Bank dining
cashback"). A "Save current filters" button lets them store these combinations by name and
apply them instantly from persistent chips above the filter bar.

## User Story
As a frequent user, I want to save my favourite filter combinations so that I can
switch between them instantly without re-selecting bank, category, and offer type
every visit.

## Scope

### In Scope
- "Save current filters" button in the filter bar (only visible when ≥ 1 filter is active)
- Name-input modal (popover or dialog) to label the preset
- Saved presets rendered as chips above the filter bar
- One-click apply: updates URL search params to match the saved preset
- Delete button on each chip
- Persistence via `localStorage` key `card-max:filter-presets`
- Maximum 10 presets; oldest auto-removed when limit is exceeded

### Out of Scope
- Server-side persistence or user accounts
- Sharing presets via URL
- Reordering presets (drag-and-drop)
- Preset import/export

## Data Contract
No database changes. Stored entirely in `localStorage`.

### Preset schema (localStorage)
```typescript
interface FilterPreset {
  id: string;       // uuid or Date.now() string
  name: string;     // user-supplied label, max 32 chars
  createdAt: string; // ISO date string
  filters: {
    bank?: string;
    category?: string;
    offerType?: string;
    sort?: string;
    activeFrom?: string;
    activeTo?: string;
  };
}
```

## API Contract
No API changes. URL search params remain the single source of truth for active filters.

## UI Behaviour

### Saving a preset
1. User applies one or more filters (URL params update)
2. "Save filters" button appears in the filter bar (BookmarkPlus icon)
3. Click opens a small Popover with a text input ("Name this preset") + "Save" button
4. On save: preset written to localStorage, Popover closes, chip appears immediately

### Applying a preset
1. Preset chip appears above the filter bar when ≥ 1 preset exists
2. Clicking a chip: `router.push("/?"+new URLSearchParams(preset.filters))`
3. Active chip (current URL matches preset) shown with filled background

### Deleting a preset
1. Each chip has an × button
2. Click removes the preset from localStorage and unmounts the chip
3. No confirmation dialog (reversible via re-saving)

### Persistence
- `useFilterPresets` custom hook reads/writes localStorage
- `suppressHydrationWarning` not needed (presets are loaded client-side only)
- Parse with try/catch; fall back to `[]` on corrupted JSON

## Acceptance Criteria
- [ ] AC1: "Save filters" button visible when ≥ 1 filter is active in the URL
- [ ] AC2: Saving a preset writes to localStorage and shows the chip immediately
- [ ] AC3: Chips persist across page reloads and new sessions
- [ ] AC4: Clicking a chip updates URL search params to match the saved preset
- [ ] AC5: Deleting a chip removes it from localStorage and the UI
- [ ] AC6: Maximum 10 presets enforced; exceeding auto-removes oldest
- [ ] AC7: Preset name capped at 32 characters
- [ ] AC8: No errors when localStorage is unavailable (e.g. SSR, incognito with storage blocked)

## Test Cases

| Test | Type | AC |
|------|------|----|
| Save button appears when filters active | component | AC1 |
| Saving writes to localStorage and renders chip | component | AC2 |
| Chip click pushes correct URL params | component | AC4 |
| Delete removes from localStorage | component | AC5 |
| 11th preset removes oldest | component | AC6 |
| localStorage unavailable — no crash | component | AC8 |

## Edge Cases
- Page loads with URL params that match a saved preset → highlight that chip as active
- Corrupted or schema-mismatch data in localStorage → parse error caught, array reset to `[]`
- localStorage quota exceeded → catch `QuotaExceededError`, show toast "Could not save preset"
- All filters cleared → "Save filters" button disappears
- Preset applied while filter drawer is open → drawer updates to reflect new active filters

## Notes
- Use `crypto.randomUUID()` for IDs (available in all modern browsers + Node.js 16+)
- `useFilterPresets` hook should be in `src/hooks/useFilterPresets.ts`
- The chips row only renders client-side (use `useEffect` + `useState` to prevent SSR hydration mismatch)
- Lucide icon: `BookmarkPlus` for save button, `Bookmark` for chip
