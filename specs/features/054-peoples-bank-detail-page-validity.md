# Feature: People's Bank Detail-Page Validity Date Extraction (054)

**GitHub Issue**: #96

## Status
- [x] Spec drafted
- [x] Spec reviewed
- [x] Implementation started
- [x] Tests written
- [x] Done

## Purpose
`crawler/scrapers/peoples_bank.ts` only parses category *listing* pages
(`peoplesbank.lk/promotion-category/{slug}/?cardType=credit_card`), calling
`extractDates()` against the concatenated listing-card paragraph text. The bank's
actual validity statement (e.g. `Validity: Till August 31, 2026 ((Every Monday &
Wednesday))`) only appears on each offer's own detail page (`sourceUrl`), so it is
never captured — offers are stored with no `validFrom`/`validUntil` even when the
bank clearly publishes a validity period. This spec adds a detail-page fetch to
recover that date (and the accompanying day-of-week condition text) for offers the
listing pass couldn't date.

## Scope

### In Scope
- For each People's Bank offer whose listing-page pass did not yield a `validUntil`,
  fetch that offer's own `sourceUrl` detail page and extract its validity line
- Recognize the detail page's `Validity: Till <date> ((<condition>))` wording as a new
  date pattern (in addition to the existing `valid from ... to ...` and `valid
  till/until/through/up to ...` patterns already handled by `extractDates()` in
  `crawler/scrapers/peoples_bank.ts`)
- Preserve any parenthesised day-of-week/conditional text (e.g. `Every Monday &
  Wednesday`) by appending it to the offer's `description` field, following the same
  approach spec 041 used for AmEx conditions text — this spec only captures the raw
  condition text; resolving it into exact applicable dates is separately tracked by
  spec 044 / issue #79
- Only issue the extra detail-page fetch for offers still missing `validUntil` after
  the listing-page pass, to bound the additional request volume (N+1 per category
  becomes "only for undated offers" rather than unconditional), and keep the existing
  `sleep(1000)` politeness delay between requests
- A scraper unit test fixture using a detail-page HTML snippet containing the
  `Validity: Till <date> ((<condition>))` pattern, asserting it parses into
  `validUntil` with the condition text preserved

### Out of Scope
- Resolving conditional text (e.g. "Every Monday & Wednesday") into exact applicable
  calendar dates — that is spec 044's `applicableDates` enrichment pipeline (issue
  #79/#95), which this spec's captured raw text feeds into
- A migration to backfill dates for already-stored People's Bank offers that predate
  this fix — the daily crawler will pick these up naturally as it re-scrapes and
  re-parses each offer's listing + detail pages on its normal cadence
- Other People's Bank scraper issues (e.g. #90's "See more" UI-chrome artifact,
  already fixed in spec 050) — this spec only touches date extraction

## Data Contract
References: `specs/data/offer.schema.ts` — `OfferSchema.validFrom` / `validUntil`
(optional `Date`), `OfferSchema.description` (optional string). No schema shape
changes — only how `validFrom`/`validUntil`/`description` are populated for People's
Bank offers.

## API Contract
No API changes. `GET /api/offers` and `GET /api/offers/[id]` already return
`validFrom`/`validUntil`/`description` as stored; this spec only improves how often
they're populated for this bank.

## UI Behaviour
No new UI. The visible effect is that more People's Bank offer cards and detail pages
show a real validity date/expiry instead of appearing to have no expiry, and any
day-of-week condition text (e.g. "Every Monday & Wednesday") is visible in the
description alongside the outer date.

## Acceptance Criteria
- [x] AC1: When a People's Bank offer's listing-page pass does not produce a
      `validUntil`, the scraper fetches that offer's `sourceUrl` detail page
- [x] AC2: A detail page containing `Validity: Till <date> ((<condition>))` is parsed
      into `validUntil` set to `<date>`
- [x] AC3: The parenthesised condition text (e.g. `Every Monday & Wednesday`) is
      appended to the offer's `description`, not discarded
- [x] AC4: Offers whose listing-page pass already produced a `validUntil` do not
      trigger an extra detail-page fetch (keeps request volume bounded)
- [x] AC5: A detail page with no recognizable validity line leaves `validUntil`
      `undefined` (no crash), same as today's behaviour when nothing can be parsed
- [x] AC6: The detail-page fetch failing (network error, non-2xx) is caught and
      logged, leaving the offer's other fields intact rather than failing the whole
      category scrape

## Test Cases

| Test | Type | AC |
|------|------|----|
| fetches detail page and extracts validUntil when listing pass has no date | unit | AC1, AC2 |
| appends parenthesised condition text to description | unit | AC3 |
| skips detail-page fetch when listing pass already has validUntil | unit | AC4 |
| detail page with no validity line leaves validUntil undefined | unit | AC5 |
| detail-page fetch failure is caught and offer still returned with other fields | unit | AC6 |

## Edge Cases
- Detail page's validity line has no parenthesised condition (e.g. just
  `Validity: Till August 31, 2026`) → `validUntil` is set, `description` unchanged
- Detail page's date format doesn't match the new pattern (e.g. unexpected wording) →
  falls through to `undefined`, same as an unparseable listing-page date today
- Multiple offers share the same `sourceUrl` (unlikely, but the scraper doesn't
  currently guarantee uniqueness) → each triggers its own fetch; no dedup added in
  this spec since it hasn't been observed as an actual problem
- `sourceUrl` missing or malformed → skip the detail-page fetch for that offer,
  behave as if the pass yielded no extra date

## Documentation Impact
None.

## Notes
- `extractDates()` and `buildDate()` in `crawler/scrapers/peoples_bank.ts` already
  handle two wording patterns; add the `Validity: Till <date>` pattern as a third
  rather than replacing the existing ones, since listing pages may still yield dates
  in the original wording for some categories
- Verify the exact wording/punctuation of the live detail page's validity line
  (parentheses count, exact phrasing) against `peoplesbank.lk` before finalizing the
  regex, since the issue's example uses double parentheses `((...))` which may be a
  copy-paste artifact rather than the literal site markup
- Related: #79 / #95 (AI offer enrichment) — this spec is the prerequisite that
  captures the raw date/condition text those specs need; related: #90 (spec 050,
  already shipped) — same scraper file, same category of listing-page text-extraction
  gaps
