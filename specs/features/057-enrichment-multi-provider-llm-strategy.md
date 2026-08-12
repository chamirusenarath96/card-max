# Feature: Pluggable Multi-Provider LLM Strategy for Offer Enrichment (057)

**GitHub Issue**: #115

## Status
- [x] Spec drafted
- [x] Spec reviewed
- [x] Implementation started
- [x] Tests written
- [x] Done

## Purpose
The enrichment pipeline (`specs/features/044-ai-offer-enrichment.md`) hardcodes a
single provider (Gemini, `gemini-flash-latest`) whose confirmed production
throughput is ~5 requests/minute, with a circuit breaker that halts the whole
run after 5 consecutive failures. Against a backlog of ~235 pending offers,
that ceiling means most offers stay `pending` for days, and every busy minute
can stall an entire run even though the failures are just rate limits, not
real errors. This spec adds a second free-tier provider (Groq) behind a common
`LLMProvider` interface and a rate-limit-aware router, so a provider hitting
its per-minute cap spills remaining work to the other provider instead of
failing outright — and adding/swapping a provider in the future is a new file
plus an env var, not a change to `enrichOffer.ts`/`run.ts`.

## Scope

### In Scope
- A provider-agnostic `LLMProvider` interface covering both capabilities the
  pipeline needs: `generateText(prompt)` (semantic summary, date-condition
  text) and `generateFromImage(image, prompt)` (vision extraction), each
  provider declaring its own name, rate limits, and whether it supports
  vision
- Two implementations:
  - `geminiProvider.ts` — wraps the existing `geminiClient.ts`/
    `gemini-flash-latest` call, `supportsVision: true`
  - `groqProvider.ts` — Groq's OpenAI-compatible chat completions endpoint,
    `supportsVision: false` (see Notes for why vision stays Gemini-only)
- Config-driven provider selection: which provider(s) are "configured" is
  derived purely from which API-key env vars are set (`GEMINI_API_KEY`,
  `GROQ_API_KEY`) — no code change needed to add/remove a provider from
  rotation, mirroring the pattern already used for scraping-proxy providers
  in `specs/features/053-scraping-proxy-fallback.md`
- A router that: picks the first configured provider with capability-match
  and remaining per-minute headroom ("fill the first provider until its
  limit, then spill to the next" — see Notes for why this strategy);  parses
  a `429`'s retry hint into a per-provider cooldown window instead of
  treating it as a generic failure; on cooldown, retries the same call
  against the next available provider before giving up
- A bounded in-run backoff: when every configured provider (for the needed
  capability) is simultaneously cooling down, sleep until the *shortest*
  cooldown expires **only if** that wait is ≤30s, then resume; otherwise
  degrade exactly like today — leave the remaining offers `pending`/`failed`
  for the next scheduled run (see Notes for the tradeoff)
- `run.ts`'s circuit breaker continues to count only genuine per-offer
  failures (parse errors, timeouts, all-providers-exhausted) — a call that
  succeeds after being routed/cooled-down/retried onto a different provider
  is not a failure and does not increment `consecutiveFailures`
- `GROQ_API_KEY` as a new, independently optional GitHub Actions secret /
  `.env.local` var — omitting it is a fully supported, zero-behavior-change
  configuration (Gemini-only, exactly as it works today)

### Out of Scope
- Any provider beyond Gemini and Groq (Mistral, Cohere, OpenRouter) — the
  interface must not preclude adding one later, but none of them ship here
- Vision support on Groq — flagged in the issue as needing real evaluation;
  current research (see Notes) found Groq's vision-capable models are
  preview-tier with narrower guarantees than its text models, so this spec
  keeps vision on Gemini only rather than betting reliability on a preview
  model. A future spec can revisit this once Groq's vision offering matures
- Persisting provider request-count/cooldown state across process runs (e.g.
  in MongoDB or a file) — each GitHub Actions run is a fresh process and a
  one-shot batch of ≤~250 offers, well under either provider's daily cap, so
  an in-memory rolling window reset per run is sufficient
- A provider-usage dashboard or alerting on quota exhaustion
- Changing spec 044's Architecture Decision #1 (enrichment stays decoupled
  from the crawler, `workflow_run`-triggered) — this spec only changes how
  enrichment calls out to LLM providers, not when/how the workflow runs
- The Kafka/n8n event-driven architecture proposed in #95 — separate,
  unresolved architectural question explicitly flagged in that issue as
  needing a human decision before any implementation; not this spec

## Data Contract
References: `specs/data/offer.schema.ts` — unchanged. This feature only
changes how enrichment text/vision calls are made and routed; it does not add
any new fields to the `Offer` document (`enrichmentStatus`, `semanticSummary`,
`applicableDates` all stay as defined in spec 044).

## API Contract
No new card-max API endpoints. This feature calls two **external** LLM APIs
directly from the new provider modules:

```
POST https://generativelanguage.googleapis.com/... (via @google/genai SDK, unchanged from geminiClient.ts)
POST https://api.groq.com/openai/v1/chat/completions
Authorization: Bearer {GROQ_API_KEY}
```

Groq's endpoint is OpenAI-chat-completions-compatible; both return generated
text on success and a non-2xx (429 for rate limits) on failure.

## Technical Approach

### 1 — Provider interface (`crawler/enrichment/providers/types.ts`)
```typescript
export interface LLMProvider {
  name: "gemini" | "groq";
  supportsVision: boolean;
  rateLimit: { requestsPerMinute: number; requestsPerDay?: number };
  generateText(prompt: string): Promise<string>;
  generateFromImage(
    image: { data: string; mediaType: string },
    prompt: string
  ): Promise<string>;
}

export class ProviderRateLimitError extends Error {
  constructor(public readonly provider: string, public readonly retryAfterMs: number) {
    super(`${provider} rate-limited, retry after ${retryAfterMs}ms`);
  }
}
```

### 2 — `geminiProvider.ts`
Wraps the existing `getGeminiClient()`/`ENRICHMENT_MODEL` from
`geminiClient.ts` (unchanged) and the existing prompt-building logic moved in
from `semanticSummary.ts`/`extractConditionsFromImages.ts`. Parses Gemini's
429 error body (`error.details[].retryDelay`, e.g. `"12s"`) into a
`ProviderRateLimitError` with `retryAfterMs`; falls back to a fixed 15s
cooldown if the field is absent so a malformed/unexpected error shape still
degrades safely instead of throwing an unrelated parse error.

### 3 — `groqProvider.ts`
```typescript
export function createGroqProvider(apiKey: string): LLMProvider {
  return {
    name: "groq",
    supportsVision: false,
    rateLimit: { requestsPerMinute: 30, requestsPerDay: 14_400 }, // confirmed free-tier limits, Aug 2026
    async generateText(prompt) {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: GROQ_TEXT_MODEL,
          messages: [{ role: "user", content: prompt }],
          max_tokens: 300,
        }),
      });
      if (res.status === 429) {
        const retryAfterMs = Number(res.headers.get("retry-after") ?? "15") * 1000;
        throw new ProviderRateLimitError("groq", retryAfterMs);
      }
      if (!res.ok) throw new Error(`Groq HTTP ${res.status}`);
      const body = await res.json();
      return body.choices?.[0]?.message?.content ?? "";
    },
    async generateFromImage() {
      throw new Error("groq provider does not support vision");
    },
  };
}
```
`GROQ_TEXT_MODEL` is a named constant (currently a current-generation Llama
text model on Groq's free tier) — kept as a single named export, same
"pin one constant, don't scatter the literal" lesson `geminiClient.ts`'s
comment already documents about model-ID churn.

### 4 — Registry (`registry.ts`, pure, unit-testable)
```typescript
export function getConfiguredProviders(env: NodeJS.ProcessEnv = process.env): LLMProvider[] {
  const providers: LLMProvider[] = [];
  if (env.GEMINI_API_KEY) providers.push(createGeminiProvider(env.GEMINI_API_KEY));
  if (env.GROQ_API_KEY) providers.push(createGroqProvider(env.GROQ_API_KEY));
  return providers; // order matters: Gemini first (existing/vision-capable), Groq spills overflow
}
```

### 5 — Router (`router.ts`, the core new logic)
```typescript
export class ProviderRouter {
  constructor(private providers: LLMProvider[]) {}

  /** Provider with capability match and unexpired cooldown + headroom in the
   *  current 60s window, in registration order (fill-first-then-spill). */
  selectProvider(capability: "text" | "vision"): LLMProvider | null { ... }

  markCooldown(providerName: string, untilEpochMs: number): void { ... }
  recordRequest(providerName: string): void { ... } // rolling 60s window
  shortestCooldownRemainingMs(capability: "text" | "vision"): number | null { ... }
}

const MAX_INLINE_BACKOFF_MS = 30_000;

export async function generateText(router: ProviderRouter, prompt: string): Promise<string> {
  return callWithRouting(router, "text", (p) => p.generateText(prompt));
}

export async function generateFromImage(
  router: ProviderRouter,
  image: { data: string; mediaType: string },
  prompt: string
): Promise<string> {
  return callWithRouting(router, "vision", (p) => p.generateFromImage(image, prompt));
}

async function callWithRouting<T>(
  router: ProviderRouter,
  capability: "text" | "vision",
  call: (p: LLMProvider) => Promise<T>
): Promise<T> {
  for (;;) {
    const provider = router.selectProvider(capability);
    if (provider) {
      router.recordRequest(provider.name);
      try {
        return await call(provider);
      } catch (err) {
        if (err instanceof ProviderRateLimitError) {
          router.markCooldown(err.provider, Date.now() + err.retryAfterMs);
          continue; // try the next available provider immediately
        }
        throw err; // non-rate-limit error: propagate as today (enrichOffer's catch handles it)
      }
    }

    const wait = router.shortestCooldownRemainingMs(capability);
    if (wait === null) throw new Error(`No ${capability}-capable provider configured or available`);
    if (wait > MAX_INLINE_BACKOFF_MS) throw new Error(`All ${capability} providers cooling down for ${wait}ms — deferring`);
    await sleep(wait);
    // loop again — the provider that just finished cooling down is now selectable
  }
}
```
A single module-scoped `ProviderRouter` instance (built from
`getConfiguredProviders()`) is shared for the lifetime of one `npx tsx
crawler/enrichment/run.ts` process, so cooldowns/window state persist across
offers within a run but never across runs (Out of Scope).

### 6 — Wiring into existing call sites, signatures unchanged
`semanticSummary.ts`'s `generateSemanticSummary()` and
`extractConditionsFromImages.ts`'s `describeImage()` (internal) swap their
direct `getGeminiClient()`/`ENRICHMENT_MODEL` calls for
`generateText(sharedRouter, prompt)` / `generateFromImage(sharedRouter, image,
prompt)` from step 5. Their **exported** signatures
(`generateSemanticSummary(input)`, `extractTextFromImages(imageUrls)`) do not
change, so `enrichOffer.ts`'s dependency-injection shape and every existing
mock of these two functions in `enrichOffer.test.ts`/`run.test.ts` keep
working unmodified — this feature is purely an internal swap of "how the text
gets generated," not a change to enrichment's data flow.

### Files to modify
- `crawler/enrichment/providers/types.ts` — new: `LLMProvider`, `ProviderRateLimitError`
- `crawler/enrichment/providers/geminiProvider.ts` — new: `createGeminiProvider()`
- `crawler/enrichment/providers/geminiProvider.test.ts` — new
- `crawler/enrichment/providers/groqProvider.ts` — new: `createGroqProvider()`, `GROQ_TEXT_MODEL`
- `crawler/enrichment/providers/groqProvider.test.ts` — new
- `crawler/enrichment/providers/registry.ts` — new: `getConfiguredProviders()`
- `crawler/enrichment/providers/registry.test.ts` — new
- `crawler/enrichment/providers/router.ts` — new: `ProviderRouter`, `generateText()`, `generateFromImage()`
- `crawler/enrichment/providers/router.test.ts` — new
- `crawler/enrichment/semanticSummary.ts` — internals call `generateText(sharedRouter, ...)`
- `crawler/enrichment/semanticSummary.test.ts` — update mocks to mock the router facade
- `crawler/enrichment/extractConditionsFromImages.ts` — internals call `generateFromImage(sharedRouter, ...)`
- `crawler/enrichment/extractConditionsFromImages.test.ts` — update mocks to mock the router facade
- `crawler/enrichment/geminiClient.ts` — unchanged; now consumed only by `geminiProvider.ts`
- `.github/workflows/enrich.yml` — add optional `GROQ_API_KEY` to the "Run enrichment" step's `env:` block
- `.env.example` — document `GROQ_API_KEY` as optional, alongside the existing `GEMINI_API_KEY` entry

## Acceptance Criteria
- [ ] AC1: `getConfiguredProviders()` returns `[]` when neither `GEMINI_API_KEY` nor `GROQ_API_KEY` is set
- [ ] AC2: `getConfiguredProviders()` returns providers in the order `[gemini, groq]` when both keys are set, and a single matching provider when only one is set
- [ ] AC3: `ProviderRouter.selectProvider("text")` returns the first configured provider that both has headroom (fewer than `rateLimit.requestsPerMinute` calls recorded in the trailing 60s) and is not cooling down
- [ ] AC4: `ProviderRouter.selectProvider("vision")` skips a provider with `supportsVision: false` even if it has headroom, and returns `null` if no configured provider supports vision
- [ ] AC5: `ProviderRouter.selectProvider()` returns `null` when every capability-matching provider is currently cooling down (per `markCooldown`) or has exhausted its per-minute window
- [ ] AC6: `markCooldown(name, until)` makes `selectProvider()` skip that provider until `until` has passed, then makes it selectable again on the next call after that time
- [ ] AC7: `generateText()` calls the selected provider's `generateText()` and returns its result directly when the first selected provider succeeds, without touching any other provider
- [ ] AC8: `generateText()` retries against the next configured provider (recording a cooldown for the first) when the first provider's call rejects with `ProviderRateLimitError`, and returns that second provider's result
- [ ] AC9: `generateText()` rejects immediately (no retry/backoff) when a provider's call rejects with a non-`ProviderRateLimitError` error
- [ ] AC10: `generateText()`/`generateFromImage()` sleep until the shortest cooldown expires and then resume when all matching providers are cooling down and the shortest remaining cooldown is ≤30s
- [ ] AC11: `generateText()`/`generateFromImage()` reject (do not sleep) when all matching providers are cooling down and the shortest remaining cooldown is >30s
- [ ] AC12: `createGeminiProvider(key).generateText(prompt)` throws `ProviderRateLimitError` with `retryAfterMs` parsed from Gemini's `error.details[].retryDelay` field on a 429-shaped error, and falls back to a 15000ms default when that field is absent
- [ ] AC13: `createGroqProvider(key).generateText(prompt)` posts to Groq's chat-completions endpoint with the configured model and returns `choices[0].message.content`; throws `ProviderRateLimitError` with `retryAfterMs` parsed from the `Retry-After` header on a 429
- [ ] AC14: `createGroqProvider(key).generateFromImage(...)` rejects with an error (Groq provider does not implement vision) and is never selected by `selectProvider("vision")` per AC4
- [ ] AC15: `generateSemanticSummary(input)` (exported signature unchanged) still returns a summary string when mocked at the router level, and `enrichOffer.test.ts`'s existing mocks of `generateSemanticSummary`/`extractTextFromImages` continue to pass unmodified
- [ ] AC16: With only `GEMINI_API_KEY` set (today's default, `GROQ_API_KEY` unset), enrichment behavior is unchanged end-to-end — a regression guard proving zero behavior change when Groq is unconfigured
- [ ] AC17: `run.ts`'s `consecutiveFailures` circuit-breaker counter does not increment for an offer whose enrichment succeeds after an internal provider-cooldown retry — only offers that return `enrichmentStatus: "failed"` count, unchanged from today
- [ ] AC18: `npm run type-check` passes with no new errors

## Test Cases

| Test | Type | AC |
|------|------|----|
| No API keys set → `getConfiguredProviders()` returns `[]` | unit (registry.test.ts) | AC1 |
| One/both API keys set → matching provider(s) returned in order | unit (registry.test.ts) | AC2 |
| Provider with headroom and no cooldown → selected | unit (router.test.ts) | AC3 |
| Vision capability requested → non-vision provider skipped; no vision provider → `null` | unit (router.test.ts) | AC4 |
| All matching providers cooling down or over window → `null` | unit (router.test.ts) | AC5 |
| `markCooldown` then time-travel past `until` → provider selectable again | unit (router.test.ts) | AC6 |
| First provider succeeds → its result returned, no other provider touched | unit (router.test.ts) | AC7 |
| First provider rate-limited → retried on second provider, second's result returned | unit (router.test.ts) | AC8 |
| Non-rate-limit error → rejects immediately, no retry | unit (router.test.ts) | AC9 |
| All providers cooling down, shortest ≤30s → sleeps then resumes | unit (router.test.ts, fake timers) | AC10 |
| All providers cooling down, shortest >30s → rejects without sleeping | unit (router.test.ts, fake timers) | AC11 |
| Gemini 429 with `retryDelay` → parsed cooldown; missing field → 15000ms default | unit (geminiProvider.test.ts) | AC12 |
| Groq success → correct request shape and parsed response; 429 → `Retry-After` parsed | unit (groqProvider.test.ts) | AC13 |
| Groq `generateFromImage` rejects; router never selects Groq for vision | unit (groqProvider.test.ts, router.test.ts) | AC14 |
| `generateSemanticSummary` returns text via mocked router; existing enrichOffer mocks pass | unit (semanticSummary.test.ts, enrichOffer.test.ts unmodified) | AC15 |
| Only `GEMINI_API_KEY` set → enrichment output identical to pre-change baseline | unit (existing enrichOffer/run test files, unmodified) | AC16 |
| Offer succeeds after internal cooldown-retry → `consecutiveFailures` unaffected | unit (run.test.ts) | AC17 |

## Edge Cases
- **A provider's API key is set but the key itself is invalid (401, not 429):**
  not a `ProviderRateLimitError`, so it propagates as a normal error per AC9 —
  no special-casing; the offer fails and `enrichOffer`'s existing catch marks
  it `enrichmentStatus: "failed"` as it does for any other error today
- **Both providers configured, both simultaneously rate-limited mid-run** (e.g.
  `CONCURRENCY = 3` offers all hit Gemini's per-minute cap at once): the
  shortest-cooldown check (AC10/AC11) applies per call, so a call bounces
  between "wait it out" and "defer" independently each time it's evaluated —
  no shared/global halt
- **`GROQ_API_KEY` set but Gemini's key is missing or invalid:** router still
  functions with Groq alone for text; vision calls have no capable provider
  and fail per AC4/AC11, degrading exactly like a total-outage scenario does
  today (offer's vision step is best-effort in `enrichOffer.ts` already —
  see `findImagesOnSourcePage`'s existing fail-open catch)
- **`rateLimit.requestsPerDay` reached mid-run:** out of scope to enforce
  precisely (Out of Scope: no cross-run persistence), but the per-minute
  window naturally throttles enough that a single ≤250-offer run cannot
  realistically exceed either provider's daily cap even at max concurrency
- **Groq's chat-completions response is missing `choices[0].message.content`**
  (malformed/empty response): `createGroqProvider` returns `""` rather than
  throwing (matches Gemini's existing `response.text?.trim() || undefined`
  pattern in `semanticSummary.ts` — an empty string is treated the same as
  "no summary produced," not a hard failure)

## Documentation Impact
- `CLAUDE.md`'s Environment Variables section: add a line for `GROQ_API_KEY`
  (optional) next to the existing `GEMINI_API_KEY` entry
- `.env.example`: add the `GROQ_API_KEY` line (see Files to modify)
- No README.md roadmap/architecture changes — the enrichment workflow's
  trigger, schedule, and DB fields are all unchanged (see Out of Scope)

## Notes
- **Why "fill-first-then-spill" over round-robin or weighted:** matches the
  strategy already chosen for scraping-proxy providers in spec 053 (simple,
  deterministic, easy to unit test) and keeps Gemini — the already-integrated,
  vision-capable provider — as the default path; Groq only picks up overflow
  once Gemini's window is exhausted, minimizing behavior change for the
  common case where a run's offer count is well under Gemini's ceiling.
- **Why Groq is text-only in this spec (AC14, Out of Scope):** a web check
  (Aug 2026) of Groq's current free-tier terms confirms healthy text limits
  (~30 requests/minute, ~14,400/day on its Llama text models) but found its
  vision-capable models are offered as preview-tier with narrower guarantees
  than the text models — the issue explicitly permits a different provider
  per capability rather than forcing a single provider to cover both, so
  vision stays on Gemini (lower volume anyway: capped at `MAX_IMAGES = 3`
  per offer in `extractConditionsFromImages.ts`, and only invoked when a
  source page actually has usable images) while Groq absorbs the
  higher-volume text path (every offer gets a `generateSemanticSummary` call).
- **Why bounded (≤30s) inline backoff over always-defer or always-wait:**
  always-waiting risks stalling the whole run for an extended period, which
  spec 044's Architecture Decision #1 explicitly rules out ("enrichment must
  stay decoupled and fast per run"); always-deferring on any simultaneous
  cooldown throws away offers that would've succeeded after a trivially short
  wait (e.g. two providers both briefly saturated by `CONCURRENCY = 3`'s
  in-flight requests). 30s was chosen as comfortably short relative to
  `enrich.yml`'s 20-minute job timeout and `ENRICHMENT_TIMEOUT_MS` (30s) per
  offer in `enrichOffer.ts`, while still meaningfully smoothing over
  short-lived simultaneous-cooldown blips instead of failing them outright.
- Related: #95 (event-driven Kafka/n8n v2) is explicitly out of scope here —
  that issue asks for a human decision on a different, larger architectural
  question and isn't specific enough to draft acceptance criteria from; this
  spec is scoped narrowly to the throughput problem within the existing
  GitHub-Actions-batch architecture spec 044 already established.
- Related: #106/spec 053's proxy-provider abstraction was the explicit
  precedent cited in the issue for keeping config/registration conventions
  consistent (env-var-driven "configured providers" list) — reused here
  where it fit, without sharing code, since the two systems proxy
  fundamentally different things (HTTP fetches vs. LLM calls).
