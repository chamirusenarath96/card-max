# Feature: Strip Scraped "See More" UI-Chrome Text from People's Bank Offers (050)

**GitHub Issue**: #90

## Status
- [x] Spec drafted
- [x] Spec reviewed
- [x] Implementation started
- [x] Tests written
- [x] Done

## Purpose
`crawler/scrapers/peoples_bank.ts` builds each offer's `description` (and sometimes
`discountLabel`/discount text) by concatenating `<p>` paragraph blocks scraped from
the bank's page. The source page includes a "See more"/"Read more" toggle as plain
text inside that same paragraph content, which the scraper doesn't filter out. It
ends up baked into stored offer text, and combined with the card's `line-clamp`
truncation, it visually reads as a working "click to expand" affordance when it's
just inert scraped text. This spec fixes the scraper and cleans up already-stored
offers with the artifact baked in.

## Scope

### In Scope
- Strip trailing (and any other) UI-chrome fragments — "See more", "Read more", "View
  more" (case-insensitive) — from text extracted by `cleanText()` in
  `crawler/scrapers/peoples_bank.ts`, applied before that text is used for
  `description`, `discountLabel`, or any other stored field derived from scraped
  paragraph text
- A scraper unit test fixture (paragraph HTML containing a trailing "See more"
  fragment, in both `parseViaPromotionCards` and `parseViaHeadings` code paths) that
  asserts the fragment is stripped from the parsed `description`
- A one-off migration script (per `.claude/commands/run-migration.md`) that
  re-applies the same stripping logic to already-stored People's Bank offers whose
  `description` or `discountLabel` currently ends with one of these fragments, since
  the daily crawler only touches offers it re-scrapes and won't retroactively clean
  offers that aren't re-scraped (e.g. expired ones)

### Out of Scope
- A real, working "see more"/"read more" expand control on the frontend — the
  existing `desc-toggle` "Show more"/"Show less" button in `OfferCardDefault`
  (`DESC_LIMIT`-based truncation) already provides this UX independently of what text
  is stored; this issue is a data-cleanliness fix, not a new frontend feature
- Auditing other People's Bank fields (category, applicable-dates text) for the same
  artifact beyond `description`/`discountLabel` — the issue flags this as worth a
  follow-up but not required here; the fix is applied generically in `cleanText()`
  wherever it's used for these two fields, but no new field-specific extraction logic
  is added
- Other banks' scrapers — this artifact has only been observed on People's Bank pages

## Data Contract
References: `specs/data/offer.schema.ts` — `OfferSchema.description` (optional
string), `OfferSchema.discountLabel` (string). No schema shape changes — only the
scraped text content is corrected before it's stored.

## API Contract
No API changes. `GET /api/offers` and `GET /api/offers/[id]` are unaffected; they
already just return `description`/`discountLabel` as stored.

## UI Behaviour
No new UI. The visible effect is that People's Bank offer descriptions on
`OfferCardDefault`/`OfferCardCompact` (and the `/offers/[id]` detail page) no longer
end with a dangling, non-functional "See more" fragment.

## Acceptance Criteria
- [x] AC1: A paragraph block ending in "See more" (case-insensitive, with or without
      surrounding whitespace/punctuation) has that fragment stripped from the parsed
      `description` in `parseViaPromotionCards`
- [x] AC2: The same stripping applies in the `parseViaHeadings` fallback path
- [x] AC3: "Read more" and "View more" trailing fragments are stripped the same way
      as "See more"
- [x] AC4: Legitimate description text that happens to contain "more" elsewhere (not
      as a trailing UI-chrome fragment) is left intact — the strip only removes the
      fragment when it appears as a trailing/standalone chrome phrase, not mid-sentence
- [x] AC5: A migration script updates existing People's Bank offers in MongoDB whose
      `description` or `discountLabel` ends with one of these fragments, stripping it
      in place
- [x] AC6: The migration is idempotent — re-running it after it has already applied
      makes zero further changes (per the standard migration template's idempotency
      guarantee)

## Test Cases

| Test | Type | AC |
|------|------|----|
| parseViaPromotionCards strips trailing "See more" from description | unit | AC1 |
| parseViaHeadings strips trailing "See more" from description | unit | AC2 |
| strips "Read more" and "View more" trailing fragments | unit | AC3 |
| does not strip "more" when it's part of normal description text (e.g. "and more categories") | unit | AC4 |
| migration updates offers with a trailing chrome fragment in description or discountLabel | integration | AC5 |
| migration is a no-op on second run (idempotency) | integration | AC6 |

## Edge Cases
- Fragment appears with trailing punctuation or whitespace variations ("See more...",
  "See more »", "See More") → still stripped (case-insensitive match, trailing
  punctuation/symbols trimmed)
- Fragment is the *entire* paragraph text (nothing else in that `<p>`) → that
  paragraph should already be filtered out by the existing `t.length > 3` /
  `t.length > 5` paragraph-length checks once the chrome phrase itself is excluded
  from counting toward useful content; if stripping leaves an empty string, the
  paragraph is dropped rather than kept as an empty description
- `description` is `undefined` (no paragraphs matched) → stripping logic is a no-op,
  no crash
- Offer's `discountLabel` (from `parseDiscount()`) doesn't come from raw paragraph
  text in the same way `description` does — only strip chrome fragments from fields
  that are actually built from concatenated `<p>` text in this scraper (`description`,
  and any input string passed into discount/category detection built from the same
  paragraphs)

## Notes
- Root cause is generic paragraph-concatenation, not something specific to
  `description` alone — implement the strip as a small shared helper (e.g.
  `stripUiChrome(text: string): string`) applied wherever `cleanText()`'s output feeds
  into a stored field, so it's easy to reuse if issue #90's own note about other
  fields (category, applicable-dates once issue #79 lands) turns out to need the same
  treatment later
- Follow `.claude/commands/run-migration.md` for the migration script template,
  including the idempotency-by-filter pattern (the filter must only match offers
  still in the pre-fix state)
- Verify the exact wording of the bank's "see more" toggle against the live
  peoples_bank.lk offers page before finalizing the regex — the issue notes it may be
  "See more", "Read more", or "View more" but the live site should be checked for the
  precise casing/punctuation actually emitted
