# Feature: Consolidate Redundant Offer Categories (048)

**GitHub Issue**: #83

## Status
- [x] Spec drafted
- [x] Spec reviewed
- [x] Implementation started
- [x] Tests written
- [x] Done

## Purpose
The 14-value `CategorySchema` enum (`specs/data/offer.schema.ts`) contains overlapping
categories — e.g. `lodging` is a subset of `travel` — which fragments the category
filter UI (spec 030) and confuses users comparing offer counts across near-duplicate
categories. This consolidates the category list into a smaller, non-overlapping set,
migrates existing offer documents, and documents the mapping for future reference.

## Scope

### In Scope
- Audit all 14 current `CategorySchema` values against real offer data to identify
  overlapping/redundant categories (`lodging` → `travel` is the one confirmed example
  from the issue; the audit must check the rest — e.g. `clothing` vs `shopping`,
  `wellness` vs `healthcare` — using actual per-category offer counts, not guesswork)
- Produce a **full old-category → new-category mapping table** (not just the one
  example) as part of this spec's implementation, added to the README
- Update `CategorySchema` in `specs/data/offer.schema.ts` to remove consolidated values
- A DB migration script (per `.claude/commands/run-migration.md`) that re-classifies
  existing offer documents from old categories to their new mapped category
- Update `crawler/utils/parseDiscount.ts` or wherever scrapers assign `category` so
  newly-scraped offers use only the consolidated category set going forward
- Update `CATEGORY_LABELS` (`src/lib/categoryLabels.ts`) and any other hardcoded
  category list/label references in the frontend to drop removed categories
- Add the full mapping table to the README's documentation

### Out of Scope
- Changing how `GET /api/categories` (spec 030) computes counts/sorting — it will
  simply reflect the new, smaller category set automatically once the schema and data
  are updated
- Renaming categories that are not being merged/removed (e.g. `dining`, `fuel` stay
  as-is unless the audit finds a genuine overlap)
- Any category *taxonomy* redesign beyond de-duplication (e.g. introducing subcategories)

## Data Contract
References: `specs/data/offer.schema.ts` — `CategorySchema` (`z.enum([...])`), the
`category` field on `OfferSchema`, and `CategoryQuerySchema`'s `category` filter param.

`CategorySchema` shrinks from its current 14 values to a smaller consolidated set.
The exact final set is determined by the audit (see Notes), with `lodging` merged
into `travel` as the one mapping confirmed by the issue. Removing a value from the
enum is a **breaking change** for any offer document or URL query param still
referencing the old value — the migration script and this spec's acceptance criteria
exist specifically to close that gap before the schema change ships.

## API Contract

### Endpoints
```
GET /api/offers?category={category}
GET /api/categories
```
No request/response *shape* changes to either endpoint (see `specs/api/openapi.yaml`).
The `category` enum values accepted/returned by both endpoints shrink to match the
new consolidated `CategorySchema`.

## UI Behaviour
- `FilterDrawer` and `SearchDrawer` category chips (spec 030) automatically reflect
  the new consolidated list once `CATEGORY_LABELS` and `CategorySchema` are updated —
  no separate UI change needed beyond removing dead label entries
- A user with an old category bookmarked/linked (e.g. `?category=lodging`) after the
  migration ships gets a URL param that no longer matches any offer (all `lodging`
  offers are now `travel`) — see Edge Cases

## Acceptance Criteria
- [x] AC1: A full old-category → new-category mapping table exists (in the README and
      referenced from this spec), covering every category identified as redundant by
      the audit — not just the `lodging → travel` example given in the issue
- [x] AC2: `CategorySchema` in `specs/data/offer.schema.ts` no longer contains any
      category that the mapping table marks as merged/removed
- [x] AC3: A migration script (following `.claude/commands/run-migration.md`'s
      idempotent-filter pattern) updates every existing offer document's `category`
      field from an old value to its mapped new value
- [x] AC4: After the migration runs, zero offer documents in the database have a
      `category` value outside the new consolidated `CategorySchema` enum
- [x] AC5: The crawler's category-assignment logic (wherever `category` is set per
      scraper/`parseDiscount.ts`) only ever assigns consolidated category values for
      newly-scraped offers
- [x] AC6: `CATEGORY_LABELS` (`src/lib/categoryLabels.ts`) contains exactly the
      consolidated category set — no stale entries for removed categories, no missing
      entries for retained ones
- [x] AC7: `GET /api/categories` and `GET /api/offers?category=X` reject/ignore any
      old, now-removed category value consistently with how they already handle
      unrecognized enum values (per spec 030's existing "unknown category" behaviour)

## Test Cases

| Test | Type | AC |
|------|------|----|
| `CategorySchema` enum only contains consolidated values (schema unit test) | unit | AC2 |
| Migration script updates documents matching an old-category filter to the mapped new category | unit (`scripts/migrate-*.test.ts` or integration) | AC3 |
| Migration script is a no-op (0 matched documents) when re-run after already applying | unit / integration | AC3 |
| `CATEGORY_LABELS` keys exactly match `CategorySchema` values (no extra, no missing) | unit | AC6 |
| Crawler category assignment never produces a removed category value for fixture HTML/JSON that previously mapped to one | unit (scraper test, e.g. `crawler/scrapers/*.test.ts` or `parseDiscount.test.ts`) | AC5 |
| `GET /api/offers?category=<removed-value>` behaves the same as any other unrecognized category (per spec 030) | unit (route.test.ts) | AC7 |
| `GET /api/categories` never returns a removed category, even if stale data exists | unit (route.test.ts) | AC7 |
| Post-migration integration check: querying the database for any document with an old category returns zero results | integration (needs real DB) — `// TODO: integration test needs real DB` | AC4 |
| FilterDrawer category chips reflect only consolidated categories after the change | e2e | AC6 |

## Edge Cases
- **User has an old category bookmarked** (e.g. `?category=lodging` in a saved link)
  after migration ships: the filter matches zero offers (all migrated to `travel`)
  rather than erroring — consistent with today's existing behaviour for any category
  with zero current offers
- **Offer scraped mid-migration** (crawler runs before the code deploy that updates
  `parseDiscount.ts` lands): may briefly insert an old-category value; the migration
  script's idempotent filter (per the run-migration pattern) still matches and corrects
  it on the next scheduled migration run, so this is self-healing, not a hard failure
- **A category has zero offers currently** (e.g. always sparse): audit must not merge
  it purely because counts are low if it is semantically distinct — merges must be
  based on semantic overlap (per the issue's "redundant/overlapping" framing), not
  just sparsity
- **Migration touches a very large number of documents**: follow the run-migration
  guidance to log count + samples before applying, so a bad mapping is caught before
  it silently corrupts the whole collection

## Notes
- This needs the DB migration workflow described in `.claude/commands/run-migration.md`
  — do not hand-edit category strings ad hoc; the migration's idempotency comes from
  its data filter (pre-migration category values), not from tracking state itself
- The current 14 `CategorySchema` values are: `dining`, `shopping`, `travel`, `lodging`,
  `homecare`, `clothing`, `fuel`, `groceries`, `entertainment`, `wellness`, `healthcare`,
  `installments`, `online`, `other`. The issue confirms `lodging → travel`; the
  implementer must audit the remainder against actual per-category offer counts
  (e.g. via the existing `GET /api/categories` aggregation from spec 030) before
  finalizing the rest of the mapping table — do not merge categories on the basis of
  the enum list alone without checking real usage
- `installments` is a payment-structure attribute rather than a merchant category in
  spirit — flag this during the audit for a human decision, but do not merge or remove
  it as part of this spec unless the mapping table explicitly documents the reasoning,
  since `offerType: "installment"` (see CLAUDE.md's Offer Type System table) already
  covers a related but distinct concept and conflating the two needs explicit sign-off
- Reference `specs/features/030-dynamic-category-filters.md` for how the category
  filter UI and `/api/categories` endpoint currently consume `CategorySchema` — this
  spec's changes must not break that feature's existing acceptance criteria
