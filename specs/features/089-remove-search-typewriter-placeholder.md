# Feature: Remove Typewriter Animation from Search Placeholder (089)

**GitHub Issue**: #192

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [ ] Implementation started
- [ ] Tests written
- [ ] Done

## Purpose
The hero search bar animates its placeholder with a typewriter effect that
types and deletes example queries ("dining offers at Keells…", "HNB credit
card deals…"). The animated text looks like a real typed value, so users read
it as an active search or try to delete it. Replace it with a plain static
placeholder so nothing in the input changes on its own, and make the `Ctrl+K`
drawer use the same wording.

## Scope

### In Scope
- `src/components/search/HeroSearch.tsx`: delete `TYPEWRITER_PHRASES`,
  `useTypewriter()` and the `typewriterText` usage; the input's `placeholder`
  becomes the constant `"Search offers, merchants, or banks…"`
- Export that string once (e.g. `SEARCH_PLACEHOLDER` from a small shared module
  in `src/components/search/`) and use it in both `HeroSearch.tsx` and
  `SearchDrawer.tsx` (which currently uses `"Search offers..."`)
- `src/components/search/HeroSearch.test.tsx`: remove the three typewriter
  tests (AC3 block: "cycles through phrases", "pauses at full phrase then
  backspaces", "uses static phrase when prefers-reduced-motion") and the
  `matchMedia` stub that existed only for them; add tests asserting the static
  placeholder
- `src/components/search/SearchDrawer.test.tsx`: assert the shared placeholder
- Update `specs/features/017-search-ux-overhaul.md` and
  `specs/features/023-live-search-suggestions.md` so they no longer describe the
  animation (mark the typewriter AC as superseded by spec 089 rather than
  deleting history), and `specs/features/027-visual-regression-testing.md` if it
  mentions masking/waiting for the typewriter
- `e2e/visual.spec.ts`: remove any typewriter-specific waiting/masking and
  regenerate the hero visual-regression baseline if it changes

### Out of Scope
- Search suggestions behaviour (spec 023), search ranking, or `Ctrl+K` shortcut
- Any other animation on the page
- Changing the placeholder wording beyond unifying the drawer to match the hero

## Data Contract
None. (`specs/data/offer.schema.ts` untouched.)

## API Contract
None. (`specs/api/openapi.yaml` untouched.)

## UI Behaviour
- Hero search input shows `Search offers, merchants, or banks…` as a normal,
  greyed placeholder from first paint; it never changes over time
- `Ctrl+K` drawer input shows the same placeholder
- Typing, suggestions and submit behave exactly as before

## Acceptance Criteria
- [ ] AC1: `HeroSearch` renders its input with
  `placeholder="Search offers, merchants, or banks…"` on first render
- [ ] AC2: The placeholder is unchanged after advancing fake timers by 10 s
  (no timer-driven updates), and the input `value` stays empty
- [ ] AC3: `useTypewriter` and `TYPEWRITER_PHRASES` no longer exist anywhere in
  `src/` (grep returns nothing)
- [ ] AC4: `SearchDrawer`'s input uses the same shared placeholder string
- [ ] AC5: Specs 017 and 023 no longer describe the typewriter as current
  behaviour; each references spec 089
- [ ] AC6: The visual-regression suite passes with updated baselines and no
  typewriter-specific masking/waits remain in `e2e/visual.spec.ts`

## Test Cases

| Test | Type | AC |
|------|------|----|
| hero input has the static placeholder on first render | component (`HeroSearch.test.tsx`) | AC1 |
| placeholder unchanged and value empty after `vi.advanceTimersByTime(10000)` | component | AC2 |
| drawer input has the shared placeholder | component (`SearchDrawer.test.tsx`) | AC4 |
| home page hero input placeholder attribute equals the static string, and is the same after 3 s | e2e (`e2e/search.spec.ts` or the existing hero search spec) | AC1, AC2 |
| visual regression hero snapshot matches regenerated baseline | e2e (`e2e/visual.spec.ts`) | AC6 |
| repo grep for `useTypewriter` / `TYPEWRITER_PHRASES` in `src/` is empty | manual check in PR (listed in PR test plan) | AC3 |
| specs 017/023 updated | manual review | AC5 |

## Edge Cases
- `prefers-reduced-motion` users already saw a static phrase; behaviour is now
  identical for everyone
- Screen readers: placeholder is now stable, so it is no longer re-announced
- Narrow mobile widths: the full placeholder may be truncated by the input
  width — acceptable (native ellipsis), no extra handling

## Documentation Impact
- `README.md`: remove any mention of the animated/typewriter search placeholder
  if present
- `CLAUDE.md`: None.

## Notes
- Typewriter currently lives at `src/components/search/HeroSearch.tsx:10-66`
  (`TYPEWRITER_PHRASES`, `useTypewriter`) and is consumed at line ~182.
