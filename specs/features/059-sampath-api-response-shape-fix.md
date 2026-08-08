# Feature: Investigate & Fix Sampath API Response Shape (059)

**GitHub Issue**: #122

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [ ] Implementation started
- [ ] Tests written
- [ ] Done

## Purpose
`crawler/scrapers/sampath.ts` calls `https://www.sampath.lk/api/card-promotions?
page_number=1&size=200` and has scraped **0 offers on every recent run** (e.g.
[2026-08-07 21:09 crawler run](https://github.com/chamirusenarath96/card-max/actions/runs/31218907967)):
`[sampath] API returned 0 promotions — check response shape`. Critically, the
request itself succeeds (`fetchJson()` doesn't throw — it's a 200 response), but
`extractPromotionList()` can't find an array under any of its expected keys
(`data`, `promotions`, `result`, `items`, `offers`) or via its last-resort
"first array-valued property" fallback. This means Sampath's response shape has
likely changed since the scraper was last verified. This spec investigates the
live response and updates the scraper to match, adding a diagnostic log so a
future shape change is easier to triage without a live investigation session.

## Scope

### In Scope
- Inspect the live, current raw JSON response from
  `https://www.sampath.lk/api/card-promotions?page_number=1&size=200` (with the
  required `Referer: https://www.sampath.lk/sampath-cards/credit-card-offer`
  header) to determine what actually changed: a renamed wrapper key, a nested
  structure (e.g. `{ data: { items: [...] } }` instead of a top-level array key),
  a pagination-cursor requirement, an added auth/anti-bot check, or a genuinely
  empty current promotions list
- Update `extractPromotionList()` in `crawler/scrapers/sampath.ts` to correctly
  parse whatever the confirmed current shape is
- Update `SampathPromotion`/`SampathApiResponse` types and `mapPromotion()` if
  field names within each promotion object have also changed (not just the
  wrapper)
- Add a diagnostic log when `extractPromotionList()` returns empty: log the
  top-level response's keys (`Object.keys(obj)`) so a future shape change is
  immediately visible in CI logs instead of requiring a live repro
- Add a fixture-based test (`crawler/scrapers/sampath.test.ts`) using the
  confirmed current response shape, replacing/supplementing any fixture that
  reflects the old shape

### Out of Scope
- Changing the Sampath API endpoint URL or query params unless the
  investigation shows they're required for the fix (e.g. if pagination now
  needs an explicit cursor/token) — start from the existing endpoint and only
  change what's proven necessary
- Any change to `CATEGORY_MAP`/`detectCategoryFromText()`'s category-mapping
  logic — out of scope unless the investigation specifically surfaces new
  category strings that need mapping
- Sampath appearing in the scraping-proxy-fallback layer (spec 053) — Sampath's
  endpoint is a same-origin JSON API requiring only a `Referer` header, not
  IP-reputation-blocked like combank/boc/ntb; this bug is a response-shape
  mismatch, not a blocking/access problem, so proxy fallback is not applicable
  here unless the investigation proves otherwise

## Data Contract
References: `specs/data/offer.schema.ts` — `OfferInputSchema` (unchanged, unless
investigation reveals a genuinely new required field Sampath now provides that's
worth capturing — flag in a follow-up spec rather than scope-creeping here).

## API Contract
No card-max API changes. This affects only `crawler/scrapers/sampath.ts`'s
parsing of the external Sampath API response:
```
GET https://www.sampath.lk/api/card-promotions?page_number=1&size=200
Referer: https://www.sampath.lk/sampath-cards/credit-card-offer
```

## Technical Approach

### 1 — Investigate the live response (blocking prerequisite)
This sandboxed session could not reach `sampath.lk` directly (outbound network
to non-allowlisted domains is proxy-restricted here), so this step must happen
with real network access during implementation:
```bash
curl -s -H "Referer: https://www.sampath.lk/sampath-cards/credit-card-offer" \
  "https://www.sampath.lk/api/card-promotions?page_number=1&size=200" | jq .
```
Compare the actual top-level shape and a sample promotion object's field names
against `SampathPromotion`/`SampathApiResponse` in `sampath.ts`. Save a
sanitized sample as a new/updated test fixture.

### 2 — Fix `extractPromotionList()`
Once the actual shape is known, either add the correct key to the existing
lookup list, or (if the array is now nested, e.g. `{ data: { list: [...] } }`)
change the extraction to walk into the nested structure:
```typescript
function extractPromotionList(response: SampathApiResponse): SampathPromotion[] {
  if (Array.isArray(response)) return response as SampathPromotion[];

  const obj = response as Record<string, unknown>;
  for (const key of ["data", "promotions", "result", "items", "offers" /* + confirmed new key(s) */]) {
    const val = obj[key];
    if (Array.isArray(val)) return val as SampathPromotion[];
    // if nested (e.g. val is itself an object with an array inside), unwrap here per investigation findings
  }

  for (const val of Object.values(obj)) {
    if (Array.isArray(val) && val.length > 0) return val as SampathPromotion[];
  }

  console.warn("[sampath] Could not locate promotions array — top-level keys:", Object.keys(obj));
  return [];
}
```

### 3 — Update field mapping if needed
If `company_name`, `short_discount`, `expire_on`, `display_on`, `image_url`,
`category`, or `cards_new` have been renamed or restructured, update
`SampathPromotion`, `mapPromotion()`, and `parseTimestamp()` accordingly.

### Files to modify
- `crawler/scrapers/sampath.ts` — fix `extractPromotionList()` (+ types/mapping
  if field names changed), add the diagnostic keys-log
- `crawler/scrapers/sampath.test.ts` — add/update a fixture reflecting the
  confirmed current response shape

## Acceptance Criteria
- [ ] AC1: `extractPromotionList()` correctly returns a non-empty array when
      given a fixture matching the confirmed current live Sampath API response
      shape
- [ ] AC2: A live/manual `npm run crawler` invocation (or `workflow_dispatch`)
      scrapes a non-zero number of Sampath offers
- [ ] AC3: When `extractPromotionList()` still can't find a promotions array
      (e.g. a further future shape change), it logs the top-level response
      keys via `console.warn` instead of only the current generic message
- [ ] AC4: Existing junk-entry filtering (`JUNK_NAME_PATTERNS`) and category
      mapping continue to work correctly against real promotion objects in the
      new fixture
- [ ] AC5: `npm run type-check` and `npm run test` pass with no new errors

## Test Cases

| Test | Type | AC |
|------|------|----|
| `extractPromotionList` parses a fixture matching the confirmed current shape into a non-empty array | unit (sampath.test.ts) | AC1 |
| `extractPromotionList` on a shape with no recognizable array logs top-level keys and returns `[]` | unit (sampath.test.ts) | AC3 |
| `mapPromotion` correctly maps a real (fixture) promotion object's fields | unit (sampath.test.ts) | AC4 |
| Junk-entry filtering still skips generic card-type header entries in the new fixture | unit (sampath.test.ts) | AC4 |
| Live/manual crawler run scrapes non-zero Sampath offers | integration (documented in PR description — not automatable in CI) | AC2 |

## Edge Cases
- **Sampath's promotions are now genuinely paginated and 200 offers no longer
  fit on `page_number=1`:** if the investigation shows this, the fix needs to
  either loop over pages or confirm the current total count fits in one page —
  document whichever is true in the PR rather than assuming
- **Sampath requires a new header/token beyond `Referer`** (e.g. an API key,
  a CSRF token derived from an initial page load): if so, this becomes a bigger
  change than a pure parsing fix — flag it back as a comment on #122 and open a
  follow-up spec rather than scope-creeping this one into a full re-architecture
- **The API is genuinely returning 0 current promotions** (not a shape change at
  all — Sampath simply has no active offers right now): if confirmed, no code
  change is needed and this issue should be closed as "not a bug" with the
  investigation findings recorded on #122 for future reference

## Documentation Impact
None — no architecture, endpoint, workflow, or SDLC process changes.

## Notes
- Unlike #120 (NTB) and #121 (BOC), this is not a blocking/proxy-fallback
  problem — the request succeeds. It's purely a parsing/shape-mismatch problem,
  so the fix is scoped entirely to `sampath.ts`.
- Step 1 (live investigation) is a hard prerequisite — this spec's Acceptance
  Criteria and Technical Approach describe the *shape* of the fix but the exact
  code diff can't be finalized until the real response is inspected with actual
  network access, which this authoring session did not have.
