# Feature: AI-Assisted Offer Enrichment — Semantic Search Field + Precise Applicable-Date Extraction (044)

**GitHub Issue**: #79

## Status
- [ ] Spec drafted
- [ ] Spec reviewed
- [ ] Implementation started
- [ ] Tests written
- [ ] Done

## Purpose
Offers currently store only a raw `description`/`discountLabel` string and a coarse
`validFrom`/`validUntil` range. This loses two kinds of value: (1) semantically rich
context (merchant, category, conditions) that keyword search can't surface, and (2)
the *actual* redemption dates for offers with conditional wording (e.g. "every
Thursday from 1st to 21st of August") which today only show the outer validity
window (see `specs/features/041-amex-conditions-extraction.md`, which captures the
raw conditions text but does not parse it into concrete dates). This feature adds an
AI-assisted enrichment step that derives a semantic-search field and a resolved set
of applicable dates from each offer's text (and, where necessary, images on the
source page).

## Scope

### In Scope
- An enrichment step (crawler-time or a separate async job — see "Architecture
  Decision Needed" below) that, per offer:
  1. Produces a semantic-search artifact (an embedding vector and/or a cleaned
     summary text) derived from the offer's `title`, `description`, `merchant`, and
     `category`
  2. Parses any conditions text (e.g. the `description` field populated by spec 041
     for AmEx, or equivalent free text from other banks) into a concrete list of
     applicable dates within the outer `[validFrom, validUntil]` window — e.g.
     "every Thursday from 1st to 21st of August" resolves to the actual Thursday
     calendar dates in that range, not just the outer range
  3. When textual conditions are insufficient and the source offer page has images
     containing terms/dates/conditions, extracts that information via a
     vision-capable model or OCR and feeds it into the same date-resolution and
     summary pipeline as step 1–2
- Enrichment failure or slowness must **never block** the crawler's core scrape/
  upsert path — an offer must save with its existing (non-enriched) fields even if
  enrichment fails, times out, or is skipped; enrichment is retryable/backfillable
  after the fact
- Enrichment fields degrade gracefully to `undefined`/empty when extraction finds
  nothing conclusive (consistent with the fail-open pattern already used by scrapers,
  e.g. spec 041's `conditionsText` fallback)

### Out of Scope
- Actually building the semantic search *query* path (e.g. a vector-search API
  endpoint, or wiring the embedding into `/api/offers?q=`) — this spec covers
  producing and storing the enrichment data; querying it is a separate follow-up
  feature once the architecture decision below is made
- Choosing/locking in a specific AI provider or model — see "Architecture Decision
  Needed"
- Backfilling all ~700 existing offers as part of this spec's initial rollout — the
  pipeline must support backfill, but running it against the full existing
  collection is an operational step, not a blocking acceptance criterion
- Any change to `validFrom` / `validUntil` extraction logic in individual scrapers —
  the outer promotion window stays as-is; resolved applicable dates are *additional*
  derived data, not a replacement

## Data Contract
References: `specs/data/offer.schema.ts` — `OfferSchema`. This feature requires new
**optional** fields on `OfferSchema` (proposed, not yet added — a human must approve
the exact shape before implementation touches the schema file):
- `semanticSummary?: string` — cleaned text used as the embedding/search input
- `embedding?: number[]` — vector representation (dimension depends on chosen model)
- `applicableDates?: string[]` — resolved ISO date strings within
  `[validFrom, validUntil]` on which the offer is actually redeemable, derived from
  conditions text/images
- `enrichmentStatus?: "pending" | "done" | "failed"` — lets the crawler/backfill job
  track which offers still need (re-)processing without blocking the main upsert

All four fields must be optional so that non-enriched offers (or offers where
enrichment fails) remain valid against `OfferInputSchema`.

## API Contract
No new or changed endpoints in this spec (querying the semantic field is out of
scope — see above). No changes to `GET /api/offers` request/response contracts other
than the new optional fields appearing in the `Offer` response shape once populated.

## Architecture Decision Needed
Per the issue's own framing, this is the largest and most architecturally open item
here. Before implementation starts, a human reviewer must resolve, and record the
decision either in an amended version of this spec or in a `/speckit-plan` output:

1. **Where does enrichment run?** A step inside each scraper's existing
   scrape/upsert flow in `crawler/scrapers/*.ts` + `crawler/run.ts`, vs. a separate
   batch/async job (e.g. a second GitHub Actions workflow) that processes
   `enrichmentStatus: "pending"` offers after the main crawl completes
2. **AI provider/model** for text summarization, date-condition parsing, and (if
   needed) image/vision extraction — cost and rate-limit considerations for ~700
   offers refreshed daily must be weighed
3. **Vector storage** — whether `embedding` is stored inline on the offer document
   (as proposed above) or in a separate collection/index, and whether this pairs
   with the existing Atlas Search index (spec 013) or introduces a distinct vector
   index
4. **Image extraction trigger** — how the pipeline decides an offer's images are
   worth processing (e.g. only when conditions text is empty/ambiguous) to avoid
   unnecessary cost on every offer

This spec's acceptance criteria below are written to be testable regardless of which
option is chosen for (1)-(4); the chosen option becomes an implementation-time
technical-approach addendum.

## Acceptance Criteria
- [ ] AC1: Given an offer with conditions text describing a recurring weekly
      restriction within a date range (e.g. "every Thursday from 1st to 21st of
      August"), the enrichment step produces an `applicableDates` list containing
      exactly the matching calendar dates in that range
- [ ] AC2: Given an offer with no parseable conditions text, `applicableDates`
      remains `undefined` rather than an incorrect guess
- [ ] AC3: Given an offer's `title`/`description`/`merchant`/`category`, the
      enrichment step produces a non-empty `semanticSummary` and/or `embedding`
      value
- [ ] AC4: If the enrichment step throws, times out, or the AI provider is
      unavailable, the offer document still saves via the existing upsert path with
      all its non-enrichment fields intact, and `enrichmentStatus` is set to
      `"failed"` (not left crashing the crawler run)
- [ ] AC5: An offer whose conditions are only present in an image on the source page
      (no usable text) has its conditions extracted via image/vision processing and
      fed into the same date-resolution logic as AC1
- [ ] AC6: A failed or pending enrichment can be retried/backfilled without
      re-scraping the offer from its source bank page (i.e. enrichment is decoupled
      from the scrape step so it can run again independently)
- [ ] AC7: All new fields (`semanticSummary`, `embedding`, `applicableDates`,
      `enrichmentStatus`) are optional on `OfferSchema` / `OfferInputSchema` — no
      existing offer document or scraper output becomes invalid because it lacks
      them

## Test Cases

| Test | Type | AC |
|------|------|----|
| conditions text "every Thursday from 1st to 21st of August" resolves to correct Thursday dates | unit | AC1 |
| conditions text with no day-of-week/date-range pattern leaves `applicableDates` undefined | unit | AC2 |
| enrichment produces non-empty `semanticSummary`/`embedding` for a well-formed offer | unit | AC3 |
| enrichment step throwing an error does not prevent the offer's core upsert | unit | AC4 |
| `enrichmentStatus` is set to `"failed"` after a simulated AI provider error | unit | AC4 |
| image-only conditions produce a parsed `applicableDates` result via the vision/OCR path | integration | AC5 |
| re-running enrichment on an offer with `enrichmentStatus: "failed"` updates it to `"done"` without a fresh scrape | integration | AC6 |
| `OfferInputSchema.safeParse()` accepts an offer object with none of the four new fields present | unit | AC7 |

## Edge Cases
- Conditions text is ambiguous or self-contradictory (e.g. "every day except
  Thursdays, valid only on Thursdays") — the resolver should fail open
  (`applicableDates: undefined`, `enrichmentStatus: "failed"`) rather than guess
- The outer `[validFrom, validUntil]` window is missing entirely (both undefined) —
  date resolution has no window to resolve within; `applicableDates` stays
  `undefined`
- AI provider rate limits are hit mid-crawl across ~700 offers — the pipeline must
  degrade to leaving remaining offers as `enrichmentStatus: "pending"` for a later
  retry pass, not fail the entire crawler run
- An offer's source images are extremely large or numerous — the image-extraction
  step must have a bounded cost/time budget per offer and skip to text-only
  processing (or leave the offer `"pending"`) rather than stalling the pipeline
- Two banks phrase the same kind of restriction very differently (e.g. "Sat & Sun
  only" vs. "Weekends") — the parser should handle both without needing
  per-bank-specific rules baked into the crawler (i.e. this is a general
  language-understanding task, not a per-scraper regex extension)

## Notes
- This is explicitly the largest/most open item among the untriaged issues in this
  batch — the issue author suggested it likely warrants its own `/speckit-plan` once
  the spec is approved, given the architecture decisions involved (AI provider
  choice, vector storage, image handling, cost). A human reviewer should treat the
  "Architecture Decision Needed" section above as required reading before approving
  this spec, and may want to route it through `/speckit-plan` rather than straight
  to `/speckit-implement` given its scope
- Related: `specs/features/041-amex-conditions-extraction.md` (captures raw
  conditions text for AmEx but does not parse it into dates — this feature is the
  natural follow-up, generalized across all banks)
- Related: `specs/features/013-atlas-search-migration.md` (Atlas Search) — semantic
  search may eventually pair with or replace parts of the existing Atlas Search
  `$search` compound query in `src/app/api/offers/route.ts`
