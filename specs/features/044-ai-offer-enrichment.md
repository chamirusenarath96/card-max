# Feature: AI-Assisted Offer Enrichment — Semantic Search Field + Precise Applicable-Date Extraction (044)

**GitHub Issue**: #79

## Status
- [x] Spec drafted
- [x] Spec reviewed
- [x] Implementation started
- [x] Tests written
- [x] Done

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
- An enrichment step, implemented as a **separate GitHub Actions workflow** that
  invokes a Claude-based enrichment routine after the daily crawl completes (see
  "Architecture Decision" below), applied only to **newly-scraped offers** from that
  crawl run (i.e. offers the crawler just inserted/updated with
  `enrichmentStatus: "pending"`), not a backfill of the whole collection. Per offer:
  1. Produces a semantic-search artifact (an embedding vector and/or a cleaned
     summary text) derived from the offer's `title`, `description`, `merchant`, and
     `category`
  2. Parses any conditions text (e.g. the `description` field populated by spec 041
     for AmEx, or equivalent free text from other banks) into a concrete list of
     applicable dates within the outer `[validFrom, validUntil]` window — e.g.
     "every Thursday from 1st to 21st of August" resolves to the actual Thursday
     calendar dates in that range, not just the outer range
  3. Whenever the source offer page has at least one image, extracts any
     terms/dates/conditions from it via Claude's vision capability and feeds that
     into the same date-resolution and summary pipeline as step 1–2 (the image
     path always runs when an image is present — it is not gated on text being
     insufficient first)
- Enrichment failure or slowness must **never block** the crawler's core scrape/
  upsert path — an offer must save with its existing (non-enriched) fields even if
  enrichment fails, times out, or is skipped; enrichment is retryable/backfillable
  after the fact
- Enrichment fields degrade gracefully to `undefined`/empty when extraction finds
  nothing conclusive (consistent with the fail-open pattern already used by scrapers,
  e.g. spec 041's `conditionsText` fallback)
- As part of shipping this feature, create an active announcement via the banner
  system from `specs/features/045-announcement-banner.md` (`POST /api/announcements`
  with `active: true`) informing visitors that offer descriptions and applicable
  dates are now AI-extracted, so the new capability isn't shipped silently

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

## Architecture Decision
Resolved directly by the human reviewer (2026-08-01), superseding the open questions
this section previously listed:

1. **Where does enrichment run?** A **separate GitHub Actions workflow**, not a step
   inside `crawler/scrapers/*.ts` / `crawler/run.ts`. It runs after the daily crawl
   workflow completes and invokes a Claude-based enrichment routine. It only
   processes offers the crawl just scraped/updated in that run (selected via
   `enrichmentStatus: "pending"` set by the crawler on new/changed offers) — it does
   **not** sweep the full ~700-offer collection on every run. This keeps enrichment
   fully decoupled from the scrape/upsert path (needed for AC4/AC6) and bounds
   per-run cost to that day's newly-scraped offers.
2. **AI provider/model**: Claude (Anthropic), for both text summarization /
   date-condition parsing and image/vision extraction — one provider for both parts
   of the pipeline. Exact model choice (e.g. cost/latency-tier selection) is an
   implementation-time detail, not a spec-level constraint.
3. **Vector storage**: `embedding` is stored in a **separate index**, not inline in
   the main offers collection query path, and it **integrates with the existing
   Atlas Search index** (spec 013) rather than introducing an unrelated search
   system — i.e. add Atlas **Vector Search** alongside the existing Atlas `$search`
   setup so both can be queried against the same underlying offers data. Querying it
   remains out of scope for this spec (see "Out of Scope").
4. **Image extraction trigger**: vision extraction runs **whenever the offer has at
   least one associated image** on the source page. It is not gated behind "text
   conditions were insufficient" — presence of an image is sufficient on its own to
   trigger the vision path (in addition to, not instead of, the text-based parsing
   in step 2). The per-offer cost/time budget from "Edge Cases" below still applies.

## Acceptance Criteria
- [x] AC1: Given an offer with conditions text describing a recurring weekly
      restriction within a date range (e.g. "every Thursday from 1st to 21st of
      August"), the enrichment step produces an `applicableDates` list containing
      exactly the matching calendar dates in that range
- [x] AC2: Given an offer with no parseable conditions text, `applicableDates`
      remains `undefined` rather than an incorrect guess
- [x] AC3: Given an offer's `title`/`description`/`merchant`/`category`, the
      enrichment step produces a non-empty `semanticSummary` and/or `embedding`
      value
- [x] AC4: If the enrichment step throws, times out, or the AI provider is
      unavailable, the offer document still saves via the existing upsert path with
      all its non-enrichment fields intact, and `enrichmentStatus` is set to
      `"failed"` (not left crashing the crawler run)
- [x] AC5: An offer whose conditions are only present in an image on the source page
      (no usable text) has its conditions extracted via image/vision processing and
      fed into the same date-resolution logic as AC1
- [x] AC6: A failed or pending enrichment can be retried/backfilled without
      re-scraping the offer from its source bank page (i.e. enrichment is decoupled
      from the scrape step so it can run again independently)
- [x] AC7: All new fields (`semanticSummary`, `embedding`, `applicableDates`,
      `enrichmentStatus`) are optional on `OfferSchema` / `OfferInputSchema` — no
      existing offer document or scraper output becomes invalid because it lacks
      them
- [ ] AC8: An active announcement (per spec 045) exists announcing the AI-extraction
      feature to visitors at/after rollout — this is an operational rollout step
      (creating the announcement via the admin-managed API), not something covered by
      automated tests, consistent with how backfilling existing offers is treated as
      an operational step rather than a blocking test-covered criterion elsewhere in
      this spec. **Left unchecked deliberately**: publishing a live public-facing
      announcement is outside an unattended automation's authority (it is
      user-visible published content) — see "Notes" below for the manual follow-up.

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
- AI provider rate limits are hit mid-run of the enrichment workflow — the pipeline
  must degrade to leaving remaining offers as `enrichmentStatus: "pending"` for a
  later retry pass, not fail the entire enrichment workflow run (and must never fail
  the separate crawler run, since the two are decoupled)
- An offer's source images are extremely large or numerous — the image-extraction
  step must have a bounded cost/time budget per offer and skip to text-only
  processing (or leave the offer `"pending"`) rather than stalling the pipeline
- Two banks phrase the same kind of restriction very differently (e.g. "Sat & Sun
  only" vs. "Weekends") — the parser should handle both without needing
  per-bank-specific rules baked into the crawler (i.e. this is a general
  language-understanding task, not a per-scraper regex extension)

## Notes
- This was originally the largest/most open item among the untriaged issues in this
  batch — the issue author flagged that it would need explicit architecture
  decisions (AI provider choice, vector storage, image handling trigger, where
  enrichment runs) before implementation. Those decisions are now resolved directly
  above in "Architecture Decision"; this spec is approved to go straight to
  implementation without a separate `/speckit-plan` pass
- Related: `specs/features/041-amex-conditions-extraction.md` (captures raw
  conditions text for AmEx but does not parse it into dates — this feature is the
  natural follow-up, generalized across all banks)
- Related: `specs/features/013-atlas-search-migration.md` (Atlas Search) — semantic
  search may eventually pair with or replace parts of the existing Atlas Search
  `$search` compound query in `src/app/api/offers/route.ts`
- Related: `specs/features/045-announcement-banner.md` — this feature's rollout must
  create an announcement through that system (AC8) so visitors are told about the new
  AI-extracted offer information, rather than the change landing unannounced
- **AC8 manual follow-up**: an admin (see `ADMIN_EMAIL` in `CLAUDE.md`) needs to sign
  in to `/admin` and create the active announcement via the existing banner UI (spec
  045) once this PR is merged and the enrichment workflow has run at least once.
  Automated implementation deliberately does not call `POST /api/announcements`
  itself — publishing a live, site-wide public announcement is a "publish public
  content" action outside an unattended automation's authority
- **`embedding` deferral**: AC3 accepts `semanticSummary` and/or `embedding` — this
  implementation populates `semanticSummary` via Claude (`crawler/enrichment/
  semanticSummary.ts`) and satisfies AC3 on that basis. `embedding` stays wired into
  the schema/model as an optional field but is left unpopulated: Claude's Messages
  API does not itself produce embedding vectors, and the Architecture Decision only
  resolved the *summarization/vision* provider, not a separate embedding-model choice
  (e.g. Voyage AI). Populating `embedding` is a natural follow-up once that model
  choice is made — the Vector Search index work in Architecture Decision #3 depends on
  it and is out of scope for this PR either way
