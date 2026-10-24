# Feature: Fix Gemini thinkingBudget:0 Regression (058)

**GitHub Issue**: #119

> Note: this spec was originally drafted as `056-fix-gemini-thinking-budget-regression.md`
> on branch `claude/crawler-failure-monitoring-b7mv2l`, which was never merged to
> master. By the time this feature was implemented, `056` and `057` had independently
> been claimed on master by other merged specs (`056-dedup-warmup-workflows.md`,
> `057-enrichment-multi-provider-llm-strategy.md`). Renumbered to `058` — the next
> free slot — with content otherwise unchanged from the original draft.

## Status
- [x] Spec drafted
- [x] Spec reviewed
- [x] Implementation started
- [x] Tests written
- [x] Done

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
No `GEMINI_API_KEY` was available in the implementation environment to reproduce
the 400 live against the current `ENRICHMENT_MODEL` resolution. Per `@google/genai`
2.15.0's `ApiError`, the request shape that previously worked embedded
`thinkingConfig: { thinkingBudget: 0 }` unconditionally in every call, with no
fallback if that value (or the field itself) is rejected by whatever model the
`-latest` alias currently resolves to. Given the uncertainty about which exact
variant the current model accepts, and per this spec's own guidance below,
implementation took the defensive path (drop `thinkingConfig` entirely) rather
than guessing a replacement magic number. Live verification against the real API
(AC1, AC2, AC6) is deferred to a manual/`workflow_dispatch` check post-merge — see
Test Cases.

### 2 — Apply the working config in both call sites
`crawler/enrichment/semanticSummary.ts`:
```typescript
config: { maxOutputTokens: 1024 },
```
`crawler/enrichment/extractConditionsFromImages.ts`'s `describeImage()`: same,
`config: { maxOutputTokens: 1024 }`.

`thinkingConfig` is omitted entirely rather than reverting to a different fixed
value — this avoids reintroducing a per-model-revision landmine if the model
alias resolves differently again in the future. `maxOutputTokens` was raised well
above the original 200/300 to give an unavoidable thinking pass headroom before
the final answer, directly addressing the original #116 truncation concern.

### 3 — Distinguish this error class going forward
`enrichOffer.ts`'s catch-all in `enrichOffer()` now surfaces the Gemini
`ApiError`'s `status` (HTTP status code, e.g. `400` vs `429` vs `503`) in the
warning log when the thrown error is an `ApiError`, so a config bug (this issue)
is distinguishable from expected quota exhaustion at a glance in CI logs, without
needing a diagnosis session like this one.

### Files modified
- `crawler/enrichment/semanticSummary.ts` — dropped `thinkingConfig`, raised `maxOutputTokens` to 1024
- `crawler/enrichment/semanticSummary.test.ts` — updated coverage
- `crawler/enrichment/extractConditionsFromImages.ts` — same fix in `describeImage()`
- `crawler/enrichment/extractConditionsFromImages.test.ts` — updated coverage
- `crawler/enrichment/enrichOffer.ts` — surfaces the Gemini `ApiError.status` in the failure log line
- `crawler/enrichment/enrichOffer.test.ts` — new coverage for the status-logging behavior

## Acceptance Criteria
- [ ] AC1: `generateSemanticSummary()` returns a non-empty summary for a
      well-formed offer against the real, current `ENRICHMENT_MODEL` — **deferred**,
      no `GEMINI_API_KEY` available in the implementation environment; requires a
      manual/`workflow_dispatch` Offer Enrichment run to confirm post-merge
- [ ] AC2: `extractTextFromImages()`'s underlying `describeImage()` call succeeds
      (no 400) against the real, current `ENRICHMENT_MODEL` — **deferred**, same as AC1
- [x] AC3: The fix does not reintroduce #116 — a unit test asserts the request
      config omits `thinkingConfig` and raises `maxOutputTokens` to accommodate
      thinking overhead
- [x] AC4: `enrichOffer()`'s failure log line includes the Gemini error's `status`
      field when present (via `ApiError.status`), so quota exhaustion and
      config/argument errors are visually distinguishable in CI logs
- [x] AC5: `npm run type-check` and `npm run test` pass with no new errors
- [ ] AC6: A full `npm run enrich` (or the equivalent `workflow_dispatch` run of
      Offer Enrichment) against production data completes at least one offer with
      `enrichmentStatus: "done"` without hitting `INVALID_ARGUMENT` — **deferred**,
      same reason as AC1/AC2; the next scheduled Offer Enrichment run after this
      merge is the first live signal

## Test Cases

| Test | Type | AC |
|------|------|----|
| `generateSemanticSummary` sends the corrected `config` shape (no `thinkingConfig`, `maxOutputTokens` >= 1024) | unit (semanticSummary.test.ts) | AC1, AC3 |
| `generateSemanticSummary` returns text on a mocked successful response | unit (semanticSummary.test.ts) | AC1 |
| `describeImage` (via `extractTextFromImages`) sends the corrected `config` shape | unit (extractConditionsFromImages.test.ts) | AC2, AC3 |
| `enrichOffer` failure log includes the `ApiError.status` when the mocked Gemini error has one | unit (enrichOffer.test.ts) | AC4 |
| `enrichOffer` failure log omits the status suffix and does not throw for a plain `Error` with no status | unit (enrichOffer.test.ts) | AC4 edge case |
| Manual/live verification against the real Gemini API | integration — **not run**, no `GEMINI_API_KEY` in this environment; needs a follow-up manual check against the next scheduled Offer Enrichment run | AC1, AC2, AC6 |

## Edge Cases
- **Model alias rotates again in the future to a model with different
  `thinkingConfig` support:** the defensive fix (drop `thinkingConfig`, rely on
  `maxOutputTokens` headroom) is specifically chosen to reduce how often this
  class of regression recurs — see Technical Approach step 2
- **Gemini error response has no `status` field** (e.g. a network-level error
  rather than an API error body): `getErrorStatus()` in `enrichOffer.ts` returns
  `undefined` for anything that isn't an `ApiError` instance, and the log line
  falls back to the existing generic message — covered by a dedicated test
- **Quota errors (`429`) still occur after this fix:** expected and out of scope
  — the circuit breaker in `run.ts` already halts gracefully on 5 consecutive
  failures regardless of the underlying error type

## Documentation Impact
None — no architecture, endpoint, workflow, or SDLC process changes. This is a
bugfix to an existing enrichment call's request parameters.

## Notes
- This is a same-day regression (introduced and broken within the same UTC day)
  — prioritized ahead of other queued specs since it fully blocks enrichment
  rather than just rate-limiting it.
- Related but distinct from #115 (pluggable multi-provider LLM strategy to avoid
  free-tier rate-limit stalls) — that spec addresses the 20-req/day quota
  ceiling; this spec only fixes the 400 that was blocking every call regardless
  of quota.
- AC1, AC2, and AC6 require a live Gemini API call and could not be verified in
  the implementation environment (no `GEMINI_API_KEY` configured locally). The
  chosen fix (omit `thinkingConfig`, rely on `maxOutputTokens` headroom) is the
  more conservative of the two options considered specifically because it does
  not depend on knowing which exact `thinkingBudget` value the current model
  accepts — but it still needs confirmation from the next live Offer Enrichment
  run. If that run still fails, the most likely next step is to inspect the
  actual error body for the specific rejected field/value.
