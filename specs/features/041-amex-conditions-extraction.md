# Feature: AmEx (NTB) Scraper — Extract Applicable Conditions into `description` (041)

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [x] Implementation started
- [x] Tests written
- [x] Done

## Purpose
Fix a data-accuracy bug in the AmEx (NTB) scraper: offers that are only redeemable
under specific conditions (a particular weekday, a date range within the month, a
"weekends only" restriction) currently show only the outer promotion `validUntil`
date, discarding the actual redemption conditions. Users see an offer as valid for
months when it is really only usable on specific days.

## User Story
As a card-max user browsing AmEx (NTB) offers, I want to see the specific
redemption conditions of an offer (e.g. "every Tuesday", "1st–7th of each month")
so that I don't plan to redeem a deal on a day it isn't actually available.

## Scope

### In Scope
- Widen text extraction in `parseOfferCards()` (`crawler/scrapers/amex.ts`) to
  capture the full conditions block for each offer card, not just the first
  "Valid till/from/until/through …" sentence currently matched by `validityMatch`
- Populate the already-existing, currently-unused `description` field on the
  `OfferInput` object built in `scrape()` (`crawler/scrapers/amex.ts:73-86`) with
  the cleaned conditions text
- Truncate the extracted text defensively to the schema's 2000-char `description`
  limit before `OfferInputSchema.safeParse()` runs, so an unexpectedly long
  conditions block cannot cause the whole offer to be silently dropped
- Add unit test fixtures for offers with day-of-week / date-range conditions
  (e.g. a Domino's-style "every Tuesday" fixture) to `crawler/scrapers/amex.test.ts`
- Verify (not build — already exists) that `OfferCardExpanded.tsx` and
  `OfferCardDefault.tsx` render the populated `description` correctly now that the
  scraper actually supplies a value

### Out of Scope
- Any change to `specs/data/offer.schema.ts` — `description` is already an
  optional `z.string().max(2000)` field (`offer.schema.ts:69`); no schema or
  Mongoose model change needed
- Any DB migration — this only changes what future scrapes write; it does not
  reshape existing documents (existing AmEx offers simply have no `description`
  until re-scraped, which is not a validity problem — `description` is optional)
- Changes to `validFrom` / `validUntil` extraction logic (`extractDates()`) — the
  outer promotion window stays as-is; conditions text is *additional* context, not
  a replacement for the date range
- New frontend UI — `OfferCardExpanded.tsx` (`data-testid="offer-description"`,
  line 93) and `OfferCardDefault.tsx` (line 103) already render `offer.description`
  when present; this spec only makes the scraper populate it
- Other banks' scrapers — this is AmEx (NTB)-specific; no other scraper currently
  discards conditions text in this way

## Data Contract
No changes. `description?: z.string().max(2000)` already exists on `OfferSchema`
and is inherited by `OfferInputSchema` (`specs/data/offer.schema.ts:69`, `:110-117`).
The Mongoose model derived from this schema already persists the field.

## API Contract
No new or changed endpoints. `GET /api/offers` and `GET /api/offers/:id` already
serialize and return `description` on every offer — the field is simply `undefined`
for AmEx offers today because the scraper never sets it.

## Technical Approach

This is a scraper bug fix, not a new-bank addition, so most of `/add-bank`'s steps
(schema enum update, `BANK_METADATA` entry, `run.ts` registration, logo map,
`FilterDrawer`) do not apply — `amex_ntb` is already fully wired up (spec 010).
Only the scraper-editing and testing conventions from `/add-bank` are relevant:

### Step 1 — Widen the conditions extraction (`crawler/scrapers/amex.ts`)

Current parsing (`parseOfferCards()`, lines 131-158) builds a `block` of HTML
around each `.alloffer-heading` match (1500 chars before, 500 chars after — see
`blockStart`/`blockEnd`, lines 141-143) and extracts only a single `validityMatch`
sentence ("Valid till/until/from/through …", up to 60 chars — line 148):

```typescript
const validityMatch = block.match(/Valid\s+(?:till|until|from|through)[^<]{5,60}/i);
const validityText = validityMatch ? validityMatch[0].trim() : "";
```

Add a second extraction that captures the surrounding conditions paragraph — the
`.alloffer-text` div's full text content (or the paragraph immediately following
the validity sentence), not just the validity clause itself:

```typescript
const conditionsMatch = block.match(/alloffer-text">([\s\S]*?)<\/div>\s*<\/a>/i);
const conditionsText = conditionsMatch ? cleanText(conditionsMatch[1]!) : "";
```

> **Note:** the exact selector/regex must be verified against the live
> `americanexpress.lk` DOM before merging (same caveat as spec 010's original
> selectors) — inspect a real offer card (e.g. the Domino's card referenced in the
> README "Known Limitations" table) to confirm where the day-of-week / date-range
> restriction text actually lives relative to `.alloffer-heading` and the validity
> sentence.

Add `conditionsText: string` to the `OfferCard` type (line 120-125).

### Step 2 — Populate `description` (`scrape()`, lines 73-86)

```typescript
const raw: Partial<OfferInput> = {
  bank: "amex_ntb",
  bankDisplayName: "American Express (NTB)",
  title: card.merchant.substring(0, 300),
  merchant: card.merchant.substring(0, 200),
  description: card.conditionsText
    ? card.conditionsText.substring(0, 2000) // OfferSchema.description max — defensive truncation
    : undefined,
  ...discount,
  category,
  validFrom,
  validUntil,
  sourceUrl,
  scrapedAt: new Date(),
};
```

The truncation must happen **before** `OfferInputSchema.safeParse(raw)` (line 88)
— per `/add-bank`'s validation rule ("Always validate with
`OfferInputSchema.safeParse()` — skip and warn on failures"), an over-length
`description` would otherwise fail validation and cause the entire offer (title,
discount, dates, everything) to be dropped, not just the description.

### Step 3 — Tests (`crawler/scrapers/amex.test.ts`)

Follow `/add-bank` step 7's fixture-based pattern already used in this file. Add:
- A fixture card whose `.alloffer-text` contains both a "Valid till …" sentence
  *and* a day-of-week/date-range restriction (e.g. `"Valid till 31st December
  2026. Applicable every Tuesday only."`) — assert `offers[0].description`
  contains the restriction text and `offers[0].validUntil` still reflects the
  outer date
- A fixture card with only the validity sentence and no extra conditions —
  assert `offers[0].description` is `undefined` (no regression for the common
  case)
- A fixture with a conditions block containing HTML entities/nested tags —
  assert the returned `description` is clean text (reuses `cleanText()`, already
  covered by existing merchant/discount tests)

Run `npm run test` to confirm all tests pass (`/add-bank` step 7).

### Step 4 — No further wiring needed

`crawler/run.ts` already calls `amex.scrape()` (spec 010, AC8). No schema, DB
migration, `FilterDrawer`, or documentation changes are required — `description`
is already documented as an optional field and already rendered by the frontend.

## Acceptance Criteria
- [ ] AC1: `parseOfferCards()` extracts a conditions block per offer card, not
      just the single "Valid …" sentence
- [ ] AC2: `scrape()` populates `OfferInput.description` with the cleaned
      conditions text when present
- [ ] AC3: `scrape()` leaves `description` as `undefined` when no additional
      conditions text is found (no regression for offers without special
      restrictions)
- [ ] AC4: Extracted `description` is truncated to 2000 chars before
      `OfferInputSchema.safeParse()` so an over-length block cannot cause the
      whole offer to be dropped
- [ ] AC5: A Domino's-style offer with a day-of-week restriction produces a
      `description` that clearly states the restriction, while `validUntil`
      still reflects the outer promotion end date
- [ ] AC6: No schema, migration, or frontend changes are required — `description`
      was already optional in `OfferInputSchema` and already rendered by
      `OfferCardExpanded.tsx` / `OfferCardDefault.tsx`

## Test Cases

| Test | Type | AC |
|------|------|----|
| `parseOfferCards()` extracts conditions text beyond the "Valid …" sentence | unit | AC1 |
| `scrape()` populates `description` when conditions text is present | unit | AC2 |
| `scrape()` leaves `description` undefined when no extra conditions text exists | unit | AC3 |
| Extracted `description` has HTML tags/entities stripped (via `cleanText()`) | unit | AC1 |
| `description` longer than 2000 chars is truncated before validation, offer still passes `safeParse` | unit | AC4 |
| Domino's-style weekly-restriction fixture → `description` mentions the restriction, `validUntil` unchanged | unit | AC5 |
| `OfferCardExpanded` renders a populated `offer.description` (existing test, re-verify with real data) | component | AC6 |
| `OfferCardDefault` renders a populated `offer.description` (existing test, re-verify with real data) | component | AC6 |

## Edge Cases
- Offer card has no conditions text beyond the validity sentence → `description`
  stays `undefined`; `OfferCardExpanded`/`OfferCardDefault` already handle a
  missing `description` (they render `offer.description ?? ""`)
- Conditions text is identical to (or a superset containing) the validity
  sentence itself → acceptable; do not attempt to strip the validity clause back
  out of the conditions text, since the surrounding sentence often provides
  useful context
- Two offers share the same `sourceUrl` across categories (existing dedup by
  `sourceUrl` in `scrape()`, line 65-67) → only the first-seen card's
  `description` is kept, consistent with existing merchant/discount dedup
  behaviour
- `americanexpress.lk` restructures `.alloffer-text` markup → `conditionsMatch`
  returns `null`, `conditionsText` falls back to `""`, `description` stays
  `undefined` — scraper degrades gracefully instead of crashing (same
  fail-open pattern as the rest of `amex.ts`)
- Conditions text contains only whitespace/empty tags after `cleanText()` →
  treat as empty string, set `description: undefined` rather than an empty string

## Notes
- Implementation: this is a scraper bug fix, not a new-bank addition — use the
  `/add-bank` command's scraper-editing conventions (Section: "Write the scraper",
  `OfferInputSchema.safeParse()` validation rule, fixture-based smoke test
  pattern) as the closest match. None of the four project commands
  (`/add-bank`, `/new-page`, `/new-github-action`, `/run-migration`) directly
  cover "modify an existing scraper's parsing logic" — `/add-bank` is referenced
  for its relevant sub-conventions only
- Source: README.md → "Known Limitations" table ("Applicable dates not
  extracted — only outer validity period captured | AmEx (NTB) | 🔴 Bug") and
  the matching unchecked Roadmap item under "🐛 Bug fixes"
- Per `CLAUDE.md` Git Conventions, branch as `feat/041-amex-conditions-extraction`
  (this now has a tracked spec number) with commits prefixed `feat(041):`
- **Command-file discrepancy found while writing this spec:** `CLAUDE.md` and
  the README both describe `/new-github-action` as one of four project slash
  commands, and existing spec `026-dedup-github-actions.md` cites it extensively
  (steps 1–7). However `.claude/commands/new-github-action.md` does not exist in
  the repository — only `add-bank.md` and `run-migration.md` are present in
  `.claude/commands/`. Similarly, `/new-page` is implemented as an **agent**
  (`.claude/agents/new-page.md`), not a command file, even though `CLAUDE.md`'s
  own "Claude Commands" table lists it under commands. This spec did not need
  either file's content, but a future spec that does (e.g. any new CI/CD
  workflow work) will not be able to pull technical details from
  `/new-github-action` until that file is restored or CLAUDE.md is corrected.
