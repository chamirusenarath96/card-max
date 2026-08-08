# Feature: Fix Gemini thinkingBudget:0 Regression (056)

**GitHub Issue**: #119

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [ ] Implementation started
- [ ] Tests written
- [ ] Done

## Purpose
#118 (commit `bed8478`) added `thinkingConfig: { thinkingBudget: 0 }` to both Gemini
`generateContent()` call sites in the offer-enrichment pipeline to fix truncated
summaries (#116), where "thinking" tokens were consuming the entire
`maxOutputTokens` budget before the model wrote its answer. Since that merge, the
very next Offer Enrichment run ([workflow run
31219137884](https://github.com/chamirusenarath96/card-max/actions/runs/31219137884),
2026-08-07 21:13) failed **every single call** with `400 INVALID_ARGUMENT: Request
contains an invalid argument.` — 7/7 offers failed, tripping the 5-consecutive-
failure circuit breaker and halting the run with 0 offers enriched. The run
immediately before the fix ([31136524723](https://github.com/chamirusenarath96/card-max/actions/runs/31136524723))
failed with `429 RESOURCE_EXHAUSTED` (quota) instead, and at least one call
succeeded. This spec fixes the regression so enrichment calls succeed again
(subject to the pre-existing free-tier quota ceiling, which is out of scope here).

## Scope

### In Scope
- Determine why `thinkingConfig: { thinkingBudget: 0 }` produces `400
  INVALID_ARGUMENT` against whatever model `ENRICHMENT_MODEL` ("gemini-flash-latest")
  currently resolves to (the pre-fix quota error names it `gemini-3.6-flash`) —
  most likely `thinkingBudget: 0` is not a value accepted by that specific model's
  API version (some Gemini model revisions reject exactly `0` and instead expect a
  strictly positive minimum, `-1` for "dynamic/automatic", or reject the
  `thinkingConfig` field outright for that model tier)
- Fix `crawler/enrichment/semanticSummary.ts` and
  `crawler/enrichment/extractConditionsFromImages.ts` so `generateContent()` calls
  succeed against the current model, while still avoiding the original #116
  truncation bug (thinking tokens silently eating `maxOutputTokens`)
- Make the fix resilient to the model alias self-updating again in the future:
  prefer a fix that fails soft (falls back to a working config) over one that
  hardcodes a value that could break identically on the next model rotation
- Add/update unit tests in `semanticSummary.test.ts` and
  `extractConditionsFromImages.test.ts` covering both the fixed request shape and
  a regression test asserting maxOutputTokens is not silently exhausted by
  thinking tokens (i.e. don't just revert #116)

### Out of Scope
- The underlying 20-requests/day free-tier quota ceiling (`429
  RESOURCE_EXHAUSTED`) — that's a capacity problem, not a bug, and is already
  tracked in #115 (pluggable multi-provider LLM strategy)
- Changing `ENRICHMENT_MODEL` away from the self-updating `"gemini-flash-latest"`
  alias — that's an intentional choice documented in `geminiClient.ts` to avoid
  the repeated manual-migration pain from pinned dated model IDs
- Any change to `crawler/run.ts`'s core scrape/upsert path — enrichment failures
  already correctly degrade to `enrichmentStatus: "failed"` without blocking the
  crawler (see `enrichOffer.ts`'s doc comment)

## Data Contract
References: `specs/data/offer.schema.ts` (unchanged). No schema changes —
`EnrichmentPatch.enrichmentStatus` remains `"done" | "failed"`.

## API Contract
No card-max API changes. This is a fix to the outbound Gemini API request shape
made from `crawler/enrichment/semanticSummary.ts` and
`crawler/enrichment/extractConditionsFromImages.ts` via `@google/genai`'s
`client.models.generateContent()`.

## Technical Approach

### 1 — Confirm the actual cause
Before changing code, reproduce the exact 400 locally/in a scratch script against
`ENRICHMENT_MODEL` with the current `@google/genai` SDK version pinned in
`package.json`, trying:
- `thinkingConfig: { thinkingBudget: 0 }` (current, broken)
- `thinkingConfig: { thinkingBudget: -1 }` (Gemini's documented "dynamic thinking"
  sentinel on some model families)
- Omitting `thinkingConfig` entirely and instead only raising `maxOutputTokens`
  high enough that thinking tokens can't starve the answer (the more conservative
  fix, closer to the original problem statement in #116)

Use whichever variant returns a 200 with non-empty `response.text` for a sample
prompt matching `buildPrompt()`'s shape.

### 2 — Apply the working config in both call sites
`crawler/enrichment/semanticSummary.ts`:
```typescript
config: { maxOutputTokens: 200, thinkingConfig: { thinkingBudget: /* fixed value */ } },
```
`crawler/enrichment/extractConditionsFromImages.ts`'s `describeImage()`: same
`thinkingConfig` value, keep `maxOutputTokens: 300`.

If investigation shows `thinkingConfig` itself is the unsupported field for the
current model (rather than just the `0` value), prefer dropping the field and
compensating with a higher `maxOutputTokens` instead — this avoids reintroducing
a per-model-revision landmine.

### 3 — Distinguish this error class going forward
`enrichOffer.ts`'s catch-all in `enrichOffer()` currently logs the raw Gemini
error body for any failure kind (quota, invalid argument, timeout) under the same
`[enrichment] Failed for "..."` prefix, making it hard to tell a config bug (this
issue) apart from expected quota exhaustion at a glance in CI logs. Add a cheap
distinguishing log line — e.g. surface `err.status` (Gemini's `status` field:
`RESOURCE_EXHAUSTED` vs `INVALID_ARGUMENT` vs `UNAVAILABLE`) in the existing
warning — so a future regression like this one is obvious from the workflow log
without needing to open a session like this one to diagnose it.

### Files to modify
- `crawler/enrichment/semanticSummary.ts` — fix `thinkingConfig`/`maxOutputTokens`
- `crawler/enrichment/semanticSummary.test.ts` — update/add coverage
- `crawler/enrichment/extractConditionsFromImages.ts` — same fix in `describeImage()`
- `crawler/enrichment/extractConditionsFromImages.test.ts` — update/add coverage
- `crawler/enrichment/enrichOffer.ts` — surface the Gemini `status` field in the
  failure log line

## Acceptance Criteria
- [ ] AC1: `generateSemanticSummary()` returns a non-empty summary for a
      well-formed offer against the real, current `ENRICHMENT_MODEL` (verified
      manually/in a scratch run during implementation, not just against the mock)
- [ ] AC2: `extractTextFromImages()`'s underlying `describeImage()` call succeeds
      (no 400) against the real, current `ENRICHMENT_MODEL`
- [ ] AC3: The fix does not reintroduce #116 — a unit test asserts the request
      config still bounds/avoids thinking-token consumption of the answer budget
      (either via a still-valid `thinkingConfig`, or a `maxOutputTokens` value
      chosen to accommodate thinking overhead)
- [ ] AC4: `enrichOffer()`'s failure log line includes the Gemini error's `status`
      field (e.g. `RESOURCE_EXHAUSTED`, `INVALID_ARGUMENT`) when present, so quota
      exhaustion and config/argument errors are visually distinguishable in CI logs
- [ ] AC5: `npm run type-check` and `npm run test` pass with no new errors
- [ ] AC6: A full `npm run enrich` (or the equivalent `workflow_dispatch` run of
      Offer Enrichment) against production data completes at least one offer with
      `enrichmentStatus: "done"` without hitting `INVALID_ARGUMENT`

## Test Cases

| Test | Type | AC |
|------|------|----|
| `generateSemanticSummary` sends the corrected `config` shape | unit (semanticSummary.test.ts) | AC1, AC3 |
| `generateSemanticSummary` returns text on a mocked successful response | unit (semanticSummary.test.ts) | AC1 |
| `describeImage` (via `extractTextFromImages`) sends the corrected `config` shape | unit (extractConditionsFromImages.test.ts) | AC2, AC3 |
| `enrichOffer` failure log includes `err.status` when the mocked Gemini error has one | unit (enrichOffer.test.ts, if present, or new) | AC4 |
| Manual/live verification against the real Gemini API before merge | integration (documented in PR description, not automatable in CI without burning quota) | AC1, AC2, AC6 |

## Edge Cases
- **Model alias rotates again in the future to a model with different
  `thinkingConfig` support:** the more defensive fix (drop `thinkingConfig`,
  rely on `maxOutputTokens` headroom) is preferred specifically to reduce how
  often this class of regression recurs — see Technical Approach step 2
- **Gemini error response has no `status` field** (e.g. a network-level error
  rather than an API error body): AC4's logging enhancement must not throw when
  `err.status` is undefined — fall back to the existing generic message
- **Quota errors (`429`) still occur after this fix:** expected and out of scope
  — the circuit breaker in `run.ts` already halts gracefully on 5 consecutive
  failures regardless of the underlying error type

## Documentation Impact
None — no architecture, endpoint, workflow, or SDLC process changes. This is a
bugfix to an existing enrichment call's request parameters.

## Notes
- This is a same-day regression (introduced and broken within the same UTC day)
  — prioritize this ahead of other queued specs since it fully blocks enrichment
  rather than just rate-limiting it.
- Related but distinct from #115 (pluggable multi-provider LLM strategy to avoid
  free-tier rate-limit stalls) — that spec addresses the 20-req/day quota
  ceiling; this spec only fixes the 400 that's currently blocking every call
  regardless of quota.
