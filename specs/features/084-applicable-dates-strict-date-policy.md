# Feature: Applicable Dates (Ranges + Weekdays) and Strict Date Policy (084)

**GitHub Issue**: #197

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [ ] Implementation started
- [ ] Tests written
- [ ] Done

## Purpose
Two date problems make "valid today" wrong:

1. **Weekday-only offers match every day.** "Every Tuesday", "weekends only" or "Fridays from
   1st–21st Aug" are stored as a plain `validFrom`–`validUntil` range, so `activeOn` (spec 081)
   returns them on every day of that range.
2. **Offers without dates.** `validFrom`/`validUntil` are optional in `OfferSchema`. Offers with no
   `validFrom` vanished from the date filter until the #191 workaround (spec 081), and offers with
   no `validUntil` never expire on their own.

`resolveApplicableDates` (spec 044) already expands weekday text into ISO dates, but it only runs in
the Gemini enrichment workflow (`enrich.yml`), so it only covers enriched offers. No API route or UI
reads `applicableDates` (the only reference in `src/` is the Mongoose field).

This spec adds a deterministic (no LLM) date-normalisation step to the crawler, makes both dates
required on every stored offer, and makes the API and UI use the weekday rule.

## Current State (verified against `master` @ `d8f717e`)

### Where dates come from today

| Bank | Source of dates | Phrasings handled (`file:line`) | Gaps |
|------|-----------------|---------------------------------|------|
| Commercial Bank | Detail page text (`extractDates`, `combank.ts:186`) | "valid from D Month [YYYY] to D Month YYYY", "valid till/until/through D Month YYYY" (full month names only) | No single day, month-only, short months, missing end year, "up to", weekday rules |
| Sampath | API `display_on` / `expire_on` (`parseTimestamp`, `sampath.ts:99`) | Structured timestamps; `0`/`""`/`null` → `undefined` | Text in `cards_new[]` is never parsed for dates or weekdays |
| HNB | API `from` / `to` (`parseApiDate`, `hnb.ts:109-110`) | Structured dates | Same: no text parse |
| NTB | Promo-card `<small>` validity / campaign table (`extractDates`, `ntb.ts:489`) | Same two regexes as Commercial Bank, any `\w+` month | Most promo cards only say "Valid till …", so `validFrom` is always missing (the spec 081 trigger) |
| Amex (NTB) | Card validity text (`extractDates`, `amex.ts:197`) | Same two regexes as NTB | Same |
| People's Bank | Listing/detail text (`extractDates`, `peoples_bank.ts:391`) | The two regexes plus "up to", and "Validity: Till Month D, YYYY ((Every Monday & Wednesday))" (US-style date order). The bracketed weekday text is captured as `condition` but never turned into a rule. | Weekday condition dropped |
| BOC | Card table "Expiration date : D Mon YYYY" or "valid till …" (`parseExpirationDate`, `boc.ts:156`) | End date only | `validFrom` always missing |

Each scraper builds dates with `new Date(year, month, day)` (runner-local time, which is UTC on GitHub
Actions), so stored dates are UTC midnight of the calendar day.

### `resolveApplicableDates` (`crawler/enrichment/resolveApplicableDates.ts`), known defects
- **Ranges are not expanded.** `extractWeekdays` matches each weekday token on its own, so
  "Mon–Thu" resolves to Monday and Thursday only.
- **Exclusions are read as inclusions.** "Every day except Sundays" adds Sunday. `isContradictory`
  only catches "except X … only X" for the same X.
- **Bare abbreviations cause false positives.** `\bsuns?\b`, `\bmons?\b` and `\bsats?\b` match
  merchant/venue text such as "Sun Siyam" or "Mon Repos".
- **Timezone.** `toIsoDate` uses `toISOString()`, so a local-midnight `Date` in a timezone ahead of
  UTC (e.g. a developer machine in Asia/Colombo, UTC+5:30) gives the previous calendar day.
- Only one explicit range shape ("D to D Month [YYYY]") is recognised.

### Live data
The DB was **not** sampled for this spec: `MONGODB_URI` is not available in the spec-writer
environment, so there are no per-bank counts of offers missing `validFrom`/`validUntil` or of offers
whose text mentions weekdays. The only known figure is from #191: 81 offers had no `validFrom`.
The read-only count script in Notes, or the migration's `--dry-run` (AC14), gives these counts
before the backfill writes anything.

## Scope

### In Scope
- **A. Deterministic date normalisation in the crawler (no LLM):**
  - Move `resolveApplicableDates` (and its test) to `crawler/utils/`. Enrichment imports it from
    there; no copy stays in `crawler/enrichment/`.
  - New `parseDateRange` (ranges, single days, month-only, missing years) and `parseWeekdayRule`
    (weekday rules incl. ranges and exclusions) in `crawler/utils/`.
  - New `normalizeOfferDates` step in `crawler/run.ts`, between `scrape()` and `upsertOffers()`,
    that fills missing dates, detects the weekday rule, and expands `applicableDates`.
  - New fields `applicableWeekdays`, `validFromInferred`, `validUntilInferred`.
- **B. Strict date policy:**
  - `validFrom` and `validUntil` required in `OfferSchema`/`OfferInputSchema` and the Mongoose model.
    Scrapers return a new `ScrapedOffer` type with optional dates.
  - Documented fallback order: listing/API → detail-page text → fallback rule (see Decisions: infer, rolling 7 days).
  - Per-bank `datesInferred` / `datesFromText` / `skippedInvalid` / `weekdayRules` counts in `RunSummary` and the
    `CrawlerRun` record (spec 082), shown on `/admin/crawler`.
  - Migration `scripts/migrate-084-offer-dates.ts` (via `/run-migration`) that backfills existing
    documents.
- **C. App usage:**
  - `activeOn` / `activeFrom` / `activeTo` in `GET /api/offers` and the overlap filter in
    `GET /api/offers/:id/similar` respect `applicableDates`, using one shared filter builder.
  - OpenAPI contract updated (new fields, non-nullable dates, filter semantics).
  - Offer cards and the detail page show the weekday rule, e.g. "Every Tuesday · until 31 Oct".

### Out of Scope
- Poya day / public holiday exclusions ("not valid on Poya days"). There is no holiday calendar;
  such text is left in the description and does not change `applicableDates`.
- Time-of-day rules ("6pm–10pm", "lunch only").
- Fetching detail pages. That is spec 083 (#196). This spec parses whatever text the scraper
  returns, which after 083 includes detail-page terms.
- Removing each scraper's own `extractDates`. They stay as the listing-level source; consolidating
  them onto `parseDateRange` can be a follow-up.
- Rewriting the enrichment workflow beyond the import move and the merge rule in Notes.

## Data Contract
References: `specs/data/offer.schema.ts` — `OfferSchema`, `OfferInputSchema`, `OfferQuerySchema`

```ts
// OfferSchema changes
validFrom: z.coerce.date(),               // was .optional()
validUntil: z.coerce.date(),              // was .optional()
/** true when validFrom came from the fallback rule, not from the bank */
validFromInferred: z.boolean().optional(),
/** true when validUntil came from the fallback rule, not from the bank */
validUntilInferred: z.boolean().optional(),
/** Weekdays the offer is redeemable on, 0 = Sunday … 6 = Saturday; absent = every day */
applicableWeekdays: z.array(z.number().int().min(0).max(6)).min(1).max(6).optional(),
/** existing; now also written by the crawler. Sorted, deduped "YYYY-MM-DD" (Asia/Colombo calendar days) */
applicableDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),

// New: what scrapers return before normalisation
export const ScrapedOfferSchema = OfferInputSchema.extend({
  validFrom: z.coerce.date().optional(),
  validUntil: z.coerce.date().optional(),
});
export type ScrapedOffer = z.infer<typeof ScrapedOfferSchema>;
```

- A 7-day rule is stored as **no** `applicableWeekdays` (hence `.max(6)`).
- Mongoose (`src/lib/models/offer.model.ts`): `validFrom`/`validUntil` get `required: true`. Add
  `applicableWeekdays: { type: [Number] }`, `validFromInferred: Boolean`, `validUntilInferred: Boolean`.
- Date convention: a calendar date D is stored as `Date.UTC(y, m, d)` (UTC midnight), which matches
  what scrapers produce on the UTC runner today and how `z.coerce.date("YYYY-MM-DD")` parses
  `activeOn`. `validUntil` keeps this inclusive-day meaning ("until 31 Oct" = `2026-10-31T00:00Z`).
  All new helpers build dates with `Date.UTC` and format with UTC getters, so results don't depend
  on the process timezone.
- `ScrapedOffer` replaces `OfferInput` as the return type of every scraper's `scrape()` and of
  `ScraperModule` in `run.ts`.
- `RunSummary` (`crawler/utils/failureAlerts.ts`) and `ICrawlerBankSummary`
  (`src/lib/models/crawlerRun.model.ts`) gain:
  ```ts
  datesInferred?: { validFrom: number; validUntil: number };
  datesFromText?: number;      // offers where a missing date was found by parseDateRange
  skippedInvalid?: number;     // failed OfferInputSchema after normalisation (step 6); never a missing date
  weekdayRules?: number;       // offers stored with applicableWeekdays
  ```
  `ICrawlerRunTotals` gains `datesInferred` (both fields summed into one number) and `skippedInvalid`.

## API Contract

### Endpoints
```
GET /api/offers?activeOn=…|activeFrom=…&activeTo=…
GET /api/offers/:id/similar
GET /api/offers/:id
```
See `specs/api/openapi.yaml` for the full request/response schema. Changes:

- `Offer` schema: `validFrom` and `validUntil` become required and non-nullable. Add
  `applicableWeekdays` (array of int 0–6), `applicableDates` (array of `format: date` strings),
  `validFromInferred` and `validUntilInferred` (boolean). Response mappers in `route.ts` and
  `similar/route.ts` (which list fields explicitly) must include them.
- `activeOn=D` description: matches offers with `validFrom <= D <= validUntil` **and**, when the
  offer has `applicableDates`, `D` is one of them.
- `activeFrom=F` / `activeTo=T`: the range overlaps the window **and**, when the offer has
  `applicableDates`, at least one of them falls in `[F, T]` (open-ended on a missing side).
- The text "Offers with no `validUntil` are always included" is removed.

Filter shape (built once in a new `src/lib/offers/dateFilters.ts` and used by both routes):
```js
// activeOn = D, key = "YYYY-MM-DD" of D (UTC)
{ $and: [
  startsBy(D), endsOnOrAfter(D),                     // spec 081 clauses, kept as-is (see Notes)
  { $or: [ { applicableDates: { $exists: false } },
           { applicableDates: { $size: 0 } },
           { applicableDates: key } ] },
]}
// activeFrom = F and/or activeTo = T
{ $or: [ { applicableDates: { $exists: false } },
         { applicableDates: { $size: 0 } },
         { applicableDates: { $elemMatch: { $gte: keyF, $lte: keyT } } } ] }  // omit the missing bound
```
ISO `YYYY-MM-DD` strings compare correctly as strings, so no `$expr`/`$dayOfWeek` is needed.

## Normalisation Rules (A)

`normalizeOfferDates(offers: ScrapedOffer[], { now }): { accepted: OfferInput[]; rejected: ScrapedOffer[]; stats }`
is pure (no I/O). For each offer:

1. **Listing/API dates.** Keep the scraper's `validFrom`/`validUntil` when present and valid. If
   `validUntil < validFrom`, drop `validFrom`, keep `validUntil`, and log a warning.
2. **Detail/text dates.** For each date still missing, run `parseDateRange` over
   `description`, then `title`. After spec 083 the description holds the detail-page terms. A text
   result only fills a missing field and never overwrites a scraper date. Counted in `datesFromText`.
3. **Fallback rule** for anything still missing (see Decisions): `validFrom` = first-seen date,
   `validUntil` = `scrapedAt + 7 days`, recomputed on every crawl. Inferred values set
   `validFromInferred`/`validUntilInferred: true`. No offer is rejected for missing dates.
4. **Weekday rule.** `parseWeekdayRule(title + " " + description)`. The `merchant` field is never
   scanned. If a rule is found, set `applicableWeekdays`.
5. **Expansion.** `resolveApplicableDates` expands the weekdays over the offer's range, narrowed by
   any explicit sub-range in the text ("Fridays from 1st–21st Aug"). Cap the expansion at
   `min(validUntil, now + 365 days)`. Because the crawler runs daily, the window rolls forward.
   If the expansion is empty (e.g. "every Sunday" over a Mon–Fri range), drop the weekday rule and
   log a warning rather than storing an offer that never matches.
6. Validate with `OfferInputSchema.safeParse`. A failure is counted in `skippedInvalid` and logged, never thrown.

### `parseDateRange(text, { now })` → `{ validFrom?: Date; validUntil?: Date }`
| Pattern | Example | Result |
|---------|---------|--------|
| Explicit range | "valid from 1st October 2026 to 31st October 2026", "from 1 Oct to 31 Oct 2026" | from + until |
| Compact range | "1st – 31st October 2026", "01/10/2026 - 31/10/2026" (dd/mm/yyyy, Sri Lankan order) | from + until |
| US order | "October 1 – 31, 2026", "Till August 31, 2026" | from + until / until |
| End only | "till", "until", "up to", "through", "valid till", "ends on", "expires on" + date | until |
| Start only | "from 5th October onwards", "starting 5 Oct 2026" | from |
| Single day | "on 25th October 2026", "25th October only" | from = until = that day |
| Month only | "throughout August", "during the month of August", "valid in/for August 2026" | 1st – last day of month |
| Missing year | any of the above without a year | see below |

**Missing-year inference:** use `now`'s year. If that puts `validUntil` more than 30 days before
`now`, roll forward one year (a December scrape of "till 15 Jan" means next January). If `validFrom`
has no year but `validUntil` does, use `validUntil`'s year, then step back one year if
`validFrom > validUntil` ("15 Dec to 15 Jan 2027"). Month names: full and 3–4-letter
abbreviations, case-insensitive. A bare "August 2026" without one of the month-only cue words is
**not** a range ("since August 2026" must not become a range).

### `parseWeekdayRule(text)` → `number[] | undefined`
| Pattern | Example | Weekdays |
|---------|---------|----------|
| Single | "every Tuesday", "on Tuesdays", "Tuesdays only", "only on Tuesday" | [2] |
| List | "Fridays & Saturdays", "Fri, Sat and Sun", "Monday/Wednesday", "((Every Monday & Wednesday))" | [5,6] / [0,5,6] / [1,3] / [1,3] |
| Range (inclusive) | "Mon–Thu", "Mon - Thu", "Monday to Thursday", "from Monday through Friday" | [1,2,3,4] / … / [1..5] |
| Wrapping range | "Fri–Sun" | [0,5,6] |
| Weekend | "weekends", "weekend only", "Sat & Sun" | [0,6] |
| Weekday | "weekdays", "on week days" | [1..5] |
| Exclusion | "except Sundays", "excluding weekends", "not valid on Fridays" | all days minus excluded; or the positive rule minus excluded |
| Every day | "everyday", "all days", "7 days a week", "daily" | undefined (no rule) |

- **Abbreviation guard:** full day names always count. Abbreviations (`sun`, `mon`, `tue`, `wed`,
  `thu`, `fri`, `sat`, and variants) count only inside a list or range with another weekday token,
  or right after `every` / `on` / `only` / `excluding` / `except`. "Sun Siyam", "Mon Repos" and
  "Sat-Nav" yield no rule.
- **Contradiction:** if the text both requires and excludes the same day ("every day except
  Thursdays, valid only on Thursdays"), return `undefined` (fail open, as spec 044 does today).
- Result is sorted, deduped, with 1–6 entries; 7 days → `undefined`.

## UI Behaviour
- Offer cards (`OfferCardDefault`, `OfferCardExpanded`, `OfferCardCompact` via
  `offer-card-shared.ts`) and `OfferDetailView` show a weekday line when `applicableWeekdays` is set:
  - `formatWeekdayRule([2])` → "Every Tuesday"; `[0,6]` → "Weekends"; `[1,2,3,4,5]` → "Weekdays";
    `[1,2,3,4]` → "Mon–Thu"; `[0,5,6]` → "Fri–Sun" (contiguous runs are detected across the Sat→Sun wrap); `[1,3]` → "Mon & Wed"; `[1,3,5]` → "Mon, Wed & Fri".
  - Combined with the validity text: "Every Tuesday · until 31 Oct", "Weekends · 1–21 Aug 2026".
  - `data-testid="offer-weekday-rule"` on cards, `data-testid="offer-detail-weekday-rule"` on the detail page.
- `validUntilInferred: true`: show "Ongoing" instead of a date, and no
  "Expires in N days" badge (`getExpiryInfo` returns `null`). The inferred date is a crawler
  heartbeat, not a bank promise. `validFromInferred: true`: omit the start date ("Until 31 Oct",
  as today).
- `OfferDetailView`'s "No expiry date" branch becomes unreachable for migrated data. Replace it
  with "Ongoing" for inferred end dates.
- Semantic tokens only (`text-muted-foreground`), Lucide `CalendarDays` icon if an icon is used.

## Acceptance Criteria
**A. Normalisation**
- [ ] AC1: `resolveApplicableDates` lives in `crawler/utils/` with its tests. `enrichOffer.ts`
      imports it from there, and `crawler/enrichment/resolveApplicableDates.ts` no longer exists.
- [ ] AC2: `parseDateRange` handles every row of its pattern table, including missing-year rollover,
      and returns `{}` for text without a date.
- [ ] AC3: `parseWeekdayRule` handles every row of its pattern table, including ranges, wrapping
      ranges, exclusions, the abbreviation guard and contradictions.
- [ ] AC4: `resolveApplicableDates` expands an explicit weekday list (from `parseWeekdayRule`) over
      the range, narrowed by an in-text sub-range. "Mon–Thu" over one week gives 4 dates, and results
      don't depend on the `TZ` environment variable.
- [ ] AC5: `crawler/run.ts` calls `normalizeOfferDates` between `scrape()` and `upsertOffers()` for
      every bank. Weekday/date post-processing has no dependency on `enrich.yml` or any LLM.
- [ ] AC6: Scraper-provided dates are never overwritten by text-parsed or inferred dates.
- [ ] AC7: An offer saying "every Tuesday" with range 1–31 Oct 2026 is stored with
      `applicableWeekdays: [2]` and `applicableDates` = the four Tuesdays of October 2026.
- [ ] AC8: The daily re-upsert of an offer whose only change is a rolled inferred `validUntil` or a
      re-expanded `applicableDates` window does **not** set `enrichmentStatus: "pending"`.

**B. Strict date policy**
- [ ] AC9: `OfferSchema`, `OfferInputSchema` and the Mongoose model require `validFrom` and
      `validUntil`. Every scraper's `scrape()` returns `ScrapedOffer[]`.
- [ ] AC10: Fallback order is listing/API → text (`parseDateRange`) → the fallback rule (first-seen /
      `scrapedAt + 7 days`). No offer is rejected for a missing date, and no offer reaches `upsertOffers` without both dates.
- [ ] AC11: Inferred dates set `validFromInferred` / `validUntilInferred: true`.
      An inferred `validFrom` is the first-seen date and is not moved by later crawls, and an inferred
      `validUntil` is re-computed as `scrapedAt + 7 days` on every crawl that still lists the offer.
- [ ] AC12: Each bank's `RunSummary` and the persisted `CrawlerRun.summaries[]` contain
      `datesInferred.{validFrom,validUntil}`, `datesFromText`, `skippedInvalid` and `weekdayRules`.
      `CrawlerRun.totals` sums `datesInferred` and `skippedInvalid`.
- [ ] AC13: `/admin/crawler`'s "Latest run by bank" table shows "Dates inferred" and
      "Skipped (invalid)" columns, with "—" for runs recorded before this spec.
- [ ] AC14: `scripts/migrate-084-offer-dates.ts` (idempotent, supports `--dry-run`, which prints
      per-bank counts without writing) runs `normalizeOfferDates` logic over every stored offer. It
      fills missing dates from text first, then from the fallback rule: `validFrom = createdAt`
      (first-seen); `validUntil = now + 7 days` for active offers and `updatedAt` (last-seen) for
      `isExpired: true` offers. It also sets `applicableWeekdays`/`applicableDates`. After it runs,
      `countDocuments({ $or: [{ validFrom: null }, { validUntil: null }] })` is 0.
- [ ] AC15: Offer-identity expiry (`expireStaleOffers`) and zero-offer detection keep using the
      scraped offer list, so `skippedInvalid` offers never cause mass expiry.

**C. App usage**
- [ ] AC16: `GET /api/offers?activeOn=D` returns an offer with `applicableDates` only when D is one
      of its dates; offers without `applicableDates` use the range alone (spec 081 behaviour).
- [ ] AC17: `activeFrom`/`activeTo` require at least one `applicableDates` entry inside the window
      when the offer has `applicableDates`.
- [ ] AC18: `GET /api/offers/:id/similar` applies the same rule against the source offer's range.
      Both routes use the shared `src/lib/offers/dateFilters.ts`.
- [ ] AC19: API responses include `applicableWeekdays`, `applicableDates`, `validFromInferred`,
      `validUntilInferred`. `specs/api/openapi.yaml` documents them, the non-nullable dates, and the
      new filter semantics.
- [ ] AC20: Offer cards and the detail page show the weekday rule ("Every Tuesday · until 31 Oct")
      when `applicableWeekdays` is set, and nothing extra when it isn't.
- [ ] AC21: An inferred `validUntil` shows as "Ongoing" with no expiry badge.

## Test Cases

| Test | Type | AC |
|------|------|----|
| `resolveApplicableDates` existing spec 044 cases pass from the new `crawler/utils/` location | unit (`crawler/utils/resolveApplicableDates.test.ts`) | AC1 |
| `enrichOffer` still resolves applicableDates via the shared util (existing enrichOffer tests) | unit (`crawler/enrichment/enrichOffer.test.ts`) | AC1 |
| parseDateRange: "valid from 1st October 2026 to 31st October 2026" | unit (`crawler/utils/parseDateRange.test.ts`) | AC2 |
| parseDateRange: "from 1 Oct to 31 Oct 2026" (start year inherited) | unit | AC2 |
| parseDateRange: "1st – 31st October 2026" and "01/10/2026 - 31/10/2026" | unit | AC2 |
| parseDateRange: "Till August 31, 2026" (US order) | unit | AC2 |
| parseDateRange: till / until / up to / through / ends on / expires on → validUntil only | unit | AC2 |
| parseDateRange: "from 5th October onwards" → validFrom only | unit | AC2 |
| parseDateRange: "on 25th October 2026" → single day | unit | AC2 |
| parseDateRange: "throughout August" → 1–31 Aug of inferred year; "during the month of February 2028" → 1–29 Feb | unit | AC2 |
| parseDateRange: "till 15 Jan" scraped 2026-12-20 → 2027-01-15 (rollover) | unit | AC2 |
| parseDateRange: "15 Dec to 15 Jan 2027" → 2026-12-15 … 2027-01-15 | unit | AC2 |
| parseDateRange: "since August 2026" and text with no date → `{}` | unit | AC2 |
| parseDateRange: output is UTC midnight regardless of `process.env.TZ` | unit | AC2, AC4 |
| parseWeekdayRule: "every Tuesday", "on Tuesdays", "Tuesdays only" → [2] | unit (`crawler/utils/parseWeekdayRule.test.ts`) | AC3 |
| parseWeekdayRule: "Fridays & Saturdays" → [5,6]; "Fri, Sat and Sun" → [0,5,6] | unit | AC3 |
| parseWeekdayRule: "Mon–Thu", "Mon - Thu", "Monday to Thursday" → [1,2,3,4] | unit | AC3 |
| parseWeekdayRule: "Fri–Sun" → [0,5,6] (wrapping) | unit | AC3 |
| parseWeekdayRule: "weekends", "Sat & Sun" → [0,6]; "weekdays" → [1..5] | unit | AC3 |
| parseWeekdayRule: "every day except Sundays" → [1..6]; "weekdays excluding Fridays" → [1..4] | unit | AC3 |
| parseWeekdayRule: "everyday", "7 days a week" → undefined | unit | AC3 |
| parseWeekdayRule: "Sun Siyam resort", "Mon Repos café", "Sat-Nav" → undefined (abbreviation guard) | unit | AC3 |
| parseWeekdayRule: "every day except Thursdays, valid only on Thursdays" → undefined (contradiction) | unit | AC3 |
| parseWeekdayRule: People's Bank "Validity: Till August 31, 2026 ((Every Monday & Wednesday))" → [1,3] | unit | AC3 |
| resolveApplicableDates: [1,2,3,4] over a Mon–Sun week → 4 dates | unit | AC4 |
| resolveApplicableDates: "Fridays from 1st–21st Aug" inside an Aug–Dec range → Fridays 1–21 Aug only | unit | AC4 |
| resolveApplicableDates: same ISO output under `TZ=UTC` and `TZ=Asia/Colombo` | unit | AC4 |
| resolveApplicableDates: expansion capped at now + 365 days | unit | AC4 |
| normalizeOfferDates: keeps scraper dates, fills only missing ones from text | unit (`crawler/utils/normalizeOfferDates.test.ts`) | AC6, AC10 |
| normalizeOfferDates: `validUntil < validFrom` drops validFrom and warns | unit | AC6 |
| normalizeOfferDates: "every Tuesday", 1–31 Oct 2026 → weekdays [2] + 4 Tuesdays | unit | AC7 |
| normalizeOfferDates: weekday rule with empty expansion is dropped with a warning | unit | AC7 |
| normalizeOfferDates: no date anywhere → validFrom = first-seen, validUntil = scrapedAt + 7 days, both flagged, stats set | unit | AC10, AC11 |
| normalizeOfferDates: stats count datesFromText / datesInferred / skippedInvalid / weekdayRules | unit | AC12 |
| run.ts calls normalizeOfferDates before upsertOffers for each bank and puts stats in the summary | unit (`crawler/run.test.ts`) | AC5, AC12 |
| upsertOffers: inferred validFrom written via `$setOnInsert` only (first-seen kept on re-upsert) | unit (`crawler/utils/db.test.ts`) | AC11 |
| upsertOffers: rolled inferred validUntil / re-expanded applicableDates don't trigger re-enrichment | unit (`crawler/utils/db.test.ts`) | AC8 |
| buildCrawlerRunRecord: totals include datesInferred and skippedInvalid | unit (`crawler/utils/db.test.ts`) | AC12 |
| run.ts: a bank with `skippedInvalid` offers still passes the full scraped list to `expireStaleOffers` | unit (`crawler/run.test.ts`) | AC15 |
| OfferSchema rejects an offer without validFrom/validUntil; ScrapedOfferSchema accepts it | unit (new `specs/data/offer.schema.test.ts`) | AC9 |
| Each scraper's existing fixture tests still pass with the `ScrapedOffer` return type | unit (`crawler/scrapers/*.test.ts`) | AC9 |
| Migration dry-run reports per-bank counts and writes nothing; real run backfills and is idempotent | unit, mocked models (`scripts/migrate-084-offer-dates.test.ts`) — `// TODO: integration test needs real DB` | AC14 |
| dateFilters: activeOn builds the `applicableDates` `$or` with the UTC day key | unit (`src/lib/offers/dateFilters.test.ts`) | AC16 |
| dateFilters: activeFrom/activeTo build `$elemMatch` with only the given bounds | unit | AC17 |
| GET /api/offers?activeOn=… passes the shared filter to `find` (existing 081 cases kept) | unit (`src/app/api/offers/route.test.ts`) | AC16, AC17 |
| GET /api/offers response includes applicableWeekdays / applicableDates / inferred flags | unit (`src/app/api/offers/route.test.ts`) | AC19 |
| GET /api/offers/:id/similar uses the shared filter and keeps candidates without applicableDates | unit (`src/app/api/offers/[id]/similar/route.test.ts`) | AC18 |
| "every Tuesday" offer matched only for Tuesdays — mocked-DB approximation of the issue's AC | unit (`route.test.ts`) — `// TODO: integration test needs real DB` | AC16 |
| formatWeekdayRule: every mapping in the UI Behaviour list | unit (`src/components/cards/offer-card-shared.test.ts`) | AC20 |
| Offer cards render `offer-weekday-rule` with "Every Tuesday · until 31 Oct"; absent without weekdays | component (`src/components/cards/OfferCard.test.tsx`) | AC20 |
| OfferDetailView renders `offer-detail-weekday-rule`; inferred validUntil shows "Ongoing" | component (`src/components/offers/OfferDetailView.test.tsx`) | AC20, AC21 |
| getExpiryInfo returns null for an inferred validUntil | unit (`offer-card-shared.test.ts`) | AC21 |
| /admin/crawler latest-run table shows "Dates inferred" and "Skipped (invalid)", "—" for old runs | unit (`src/app/admin/crawler/runStats.test.ts`) | AC13 |
| Home page with mocked `/api/offers` returning a weekday offer shows the weekday rule on its card | e2e (`e2e/offer-weekday-rule.spec.ts`, mocked API) | AC20 |
| Offer detail page shows weekday rule or not-found (resilient SSR pattern) | e2e (`e2e/offer-weekday-rule.spec.ts`) | AC20 |

## Edge Cases
- **Weekday rule but no explicit range** ("every Friday"): range comes from scraper/text/fallback.
  Expansion runs over it, capped at 365 days.
- **Explicit sub-range outside the outer range:** clamp to the overlap (existing spec 044
  behaviour). An empty overlap means no `applicableDates`, and a warning is logged.
- **Contradictory weekday text:** no rule, and the offer matches every day in its range (fails open,
  as today).
- **Enrichment finds a rule the crawler didn't** (image OCR text): enrichment's `applicableDates`
  wins when defined. The crawler only `$unset`s `applicableDates`/`applicableWeekdays` when the
  offer's text changed (`needsReEnrichment`) and its own parse found no rule, so a daily re-upsert
  never wipes an enrichment result for unchanged text.
- **Offer already past `validUntil`:** stored and filtered as today; this spec does not change
  `isExpired` semantics.
- **Leap years / month ends:** month-only "February" uses the real last day; "31st" in a 30-day month
  is invalid, so that date is treated as missing (the next fallback step applies).
- **Mixed-language / Sinhala text:** not parsed. Falls to the next fallback step.
- **Migration on documents that fail validation for other reasons:** skip, log the `_id`, keep going,
  and report the count at the end.
- **Deploy ordering:** CI's `migrate` job runs before `deploy`, so the required fields are backfilled
  before the stricter Zod parse goes live. The spec 081 null-tolerant clauses in the filters stay as
  a cheap guard (see Notes).

## Decisions

### Q1. Fallback rule when a date can't be found in the listing, API or detail text — **Decided: Option A, N = 7**
Decided by the repo owner on #197 (2026-10-27). The option considered and not chosen is kept below
for the record.

**Chosen — Option A, infer (rolling):**
`validFrom = first-seen date` (`$setOnInsert`, so later crawls don't move it).
`validUntil = scrapedAt + 7 days`, recomputed on every crawl that still lists the offer.
Both are flagged `…Inferred: true`, and the UI shows "Ongoing" for an inferred end date. When the
bank delists the offer, `expireStaleOffers` marks it expired as it does today, and the inferred
`validUntil` stops rolling. N = 7 was the recommended value. The decision did not name a
different N, so 7 applies.

**Not chosen — Option B, reject:** do not store offers that still lack a date after the text parse,
and count them as `skipped_no_dates`. It would have dropped every offer that only publishes an end
date: all NTB promo cards ("Valid till …"), all BOC offers (only "Expiration date") and many
Amex/People's Bank offers. The 81 offers from #191 are exactly this group. The middle option B′
(infer `validFrom`, reject a missing `validUntil`) was not chosen either.

Why A:
- A missing `validFrom` has an honest answer: the offer was live when we first saw it.
- A short rolling `validUntil` means a delisted offer never looks valid for more than 7 days, even
  if the crawler stops running. `expireStaleOffers` handles normal delisting the next day. "End of
  month" was considered and not chosen: it ranges from 1 to 31 days and reads like a real bank
  deadline.
- The `…Inferred` flags let the UI show "Ongoing" instead of a made-up date, and the
  `datesInferred` counts on `/admin/crawler` show which banks need scraper work.

### Q2. Expansion horizon (default, no decision needed)
The default is 365 days ahead of the scrape date. Change it only if offers longer than a year with
weekday rules are known to exist.

## Documentation Impact
- `CLAUDE.md` → Architecture: add `crawler/utils/normalizeOfferDates.ts` (date post-processing,
  spec 084) next to the other `crawler/utils/` entries. Offer Type System section unchanged.
- `README.md` → data-model / "Offer fields" section: document `applicableWeekdays`,
  `applicableDates`, `validFromInferred`, `validUntilInferred`, required `validFrom`/`validUntil`,
  and the fallback rule (first-seen / rolling 7 days, "Ongoing" in the UI). Update the crawler pipeline description (scrape → normalise dates →
  upsert). Mark the related roadmap item done. Spec index row (added with this spec).
- `specs/features/044-ai-offer-enrichment.md` → note that `resolveApplicableDates` moved to
  `crawler/utils/` and is shared with the crawler (spec 084).
- `specs/features/081-date-filter-missing-valid-from.md` → note that after spec 084's migration
  the null branches are defensive only.
- `specs/api/openapi.yaml` → as in API Contract.

## Notes
- **Read-only count script for the reviewer** (Mongoose, not raw MongoDB; save as a scratch
  `tsx` file and do not commit):
  ```ts
  import mongoose from "mongoose";
  import { OfferModel } from "./src/lib/models/offer.model";
  await mongoose.connect(process.env.MONGODB_URI!, { dbName: "card-max" });
  const missing = await OfferModel.aggregate([
    { $match: { isExpired: false } },
    { $group: { _id: "$bank", total: { $sum: 1 },
      noFrom: { $sum: { $cond: [{ $ifNull: ["$validFrom", false] }, 0, 1] } },
      noUntil: { $sum: { $cond: [{ $ifNull: ["$validUntil", false] }, 0, 1] } },
      weekdayText: { $sum: { $cond: [{ $regexMatch: {
        input: { $concat: ["$title", " ", { $ifNull: ["$description", ""] }] },
        regex: "monday|tuesday|wednesday|thursday|friday|saturday|sunday|weekend|weekday", options: "i" } }, 1, 0] } },
    } },
  ]);
  console.table(missing);
  await mongoose.disconnect();
  ```
- **Re-enrichment guard (AC8):** `needsReEnrichment` in `crawler/utils/db.ts` compares
  `validUntil`. Skip that comparison when both stored and incoming `validUntil` are inferred, so a
  daily +1 day roll doesn't re-queue Gemini work for every undated offer. `applicableDates` is not in
  `ENRICHMENT_RELEVANT_FIELDS` and must stay out of it.
- **Spec 081 clauses:** keep `{ validFrom: null }` / `{ validUntil: { $exists: false } }` in the
  shared filter builder. After migration they never match, and they cost nothing, but they keep the
  site correct if a document ever slips past validation (e.g. a manual Atlas edit).
- **Index:** not needed at the current collection size (low thousands). If `activeOn` queries slow
  down, add `{ isExpired: 1, applicableDates: 1 }` (multikey).
- **Dependency on spec 083 (#196):** not blocking. Without 083 the text parse sees less text, so more
  offers fall to the fallback rule. The `datesFromText` vs `datesInferred` counts will show the
  difference once 083 ships.
- **Suggested file layout:** `crawler/utils/{parseDateRange,parseWeekdayRule,resolveApplicableDates,normalizeOfferDates}.ts`
  (+ colocated tests), `src/lib/offers/dateFilters.ts` (+ test), `formatWeekdayRule` in
  `src/components/cards/offer-card-shared.ts`, `scripts/migrate-084-offer-dates.ts`.
