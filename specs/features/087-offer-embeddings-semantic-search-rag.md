# Feature: Offer Embeddings, Semantic Similarity, Hybrid Search and RAG Q&A (087)

**GitHub Issue**: #188

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [ ] Implementation started
- [ ] Tests written
- [ ] Done

## Purpose
Offers are only findable by keyword (Atlas `$search`, spec 013) and "similar
offers" is category + overlapping-validity matching only (spec 046). Spec 044
added `semanticSummary` and reserved `embedding?: number[]` on the offer schema
but deferred populating it. This spec turns offers into vector embeddings so the
site can (1) show semantically similar offers across banks, (2) match
meaning-based queries ("cheap seafood dinner this weekend"), and (3) answer
natural-language questions grounded **only** in retrieved, non-expired offers.
It is staged: a research decision first, then five independently shippable
implementation stages. Each stage can be its own PR against this spec.

## Scope

### In Scope
- **Stage 0 — Research decision** (written into the "Architecture Decision"
  section of this spec, in the first PR, before any code). Must record:
  - Embedding model + dimension, chosen from: a current Gemini embedding model
    (reuse `GEMINI_API_KEY`; verify the live model name, dimensions and
    free-tier RPM/RPD at implementation time), and at least one open-source
    sentence-transformer runnable in GitHub Actions. Criteria: quality on short
    offer text, multilingual (Sinhala/Tamil) handling, free-tier fit for
    ~700 offers/day + re-embeds
  - Embedding input text: `semanticSummary` vs. a composed
    `title + merchant + description + discountLabel + category + bankDisplayName`
    string (one vector per offer)
  - Atlas Vector Search fit on the current M0 cluster (index count and size
    limits for ~1k vectors at the chosen dimension), with a fallback only if
    it doesn't fit
  - Hybrid strategy: reciprocal-rank fusion (RRF, k = 60 unless the eval says
    otherwise) of `$search` and `$vectorSearch` vs. pure vector
  - RAG answering LLM via the spec-057 provider router (Gemini → Groq),
    prompt design, latency and per-query cost
  - Results of the evaluation below (keyword vs. vector vs. hybrid)
- **Evaluation set** `crawler/enrichment/eval/semanticQueries.json`: ≥ 20
  labelled queries → expected offer matches (by merchant + bank, so they
  survive re-scrapes), plus a script that reports recall@5 per strategy
- **Stage 1 — Populate embeddings** in `crawler/enrichment/` for offers that
  are new or whose embedding input text changed (track via a stored hash of
  the input text), plus a one-off backfill via `/run-migration`. Runs in the
  enrichment workflow only; never blocks or fails the crawl (same decoupling
  as spec 044)
- **Stage 2 — Atlas Vector Search index** definition checked into the repo
  and a `$vectorSearch` query helper in `src/lib/` that goes through the
  Mongoose `Offer` model's `aggregate()` (no raw driver calls), always
  pre-filtering to non-expired offers
- **Stage 3 — Semantic similar offers**: `GET /api/offers/{id}/similar`
  returns nearest neighbours by embedding, excluding the source offer and
  expired offers; falls back to today's category matching when the source
  offer has no embedding or the vector query fails
- **Stage 4 — Hybrid search** behind `GET /api/offers?q=`: RRF of keyword and
  vector results when an embedding for the query can be computed; keyword-only
  otherwise. Response shape unchanged
- **Stage 5 — RAG Q&A**: new `POST /api/ask` (body `{ question: string }`,
  Zod-validated, 3–300 chars) that retrieves top-k (k = 8) offers via the
  hybrid helper, asks the LLM to answer **only** from those offers, and returns
  `{ answer: string, citations: { offerId: string, title: string, url: string }[] }`.
  Rate-limited per IP through the existing Upstash limiter in
  `src/middleware.ts`. UI: an "Ask about offers" box on the home page that
  renders the answer and cited offers as links to `/offers/{id}`

### Out of Scope
- A multi-step agent with tool calling (that is #190 / spec 088)
- Any new paid service, separate vector database, or self-hosted model server
- Personalisation, user accounts, or storing user questions beyond request logs
- Changing the keyword Atlas Search index definition from spec 013

## Data Contract
References: `specs/data/offer.schema.ts` — `OfferSchema.semanticSummary`,
`OfferSchema.embedding` (already defined, currently unpopulated). The
implementer may need an `embeddingInputHash` (string) and `embeddingModel`
(string) field to detect stale vectors; that is a schema change to be made in
`specs/data/offer.schema.ts` by the implementing PR (with the Mongoose model
derived from it), not by this spec.

## API Contract
- `GET /api/offers/{id}/similar` — same response shape as today (spec 046)
- `GET /api/offers?q=` — same response shape as today
- **New** `POST /api/ask` — request/response as above; errors: 400 (invalid
  body), 429 (rate limited), 503 (`{ error: "ask_unavailable" }` when the LLM
  or vector search is unavailable)

`specs/api/openapi.yaml` must be updated by the implementing PR to add
`/ask` (this spec does not edit it).

## UI Behaviour
- Offer detail page "Similar offers" section shows semantically related offers
  from any bank/category (Stage 3); visually unchanged
- Search results for meaning-based queries include relevant offers whose text
  does not contain the query words (Stage 4)
- Home page "Ask about offers" box (`data-testid="ask-box"`): user types a
  question, sees a loading state, then an answer (`data-testid="ask-answer"`)
  with a list of cited offers (`data-testid="ask-citation-{offerId}"`) linking
  to their detail pages. When nothing matches, the answer says no matching
  offers were found. On 429/503 an inline message suggests using normal search
  (`data-testid="ask-fallback"`)

## Acceptance Criteria
- [ ] AC1: The Architecture Decision section of this spec records model,
  dimension, embedded text, storage/index limits, hybrid strategy, RAG LLM,
  free-tier numbers, and eval results, merged before Stage 1 code
- [ ] AC2: The eval set has ≥ 20 labelled queries and the eval script prints
  recall@5 for keyword, vector and hybrid
- [ ] AC3: After one enrichment run, every active offer has an `embedding` of
  the chosen dimension; an offer whose input text is unchanged is not
  re-embedded; a changed offer is re-embedded in the next run
- [ ] AC4: An embedding provider error or quota exhaustion is logged and the
  enrichment run continues for remaining offers; the crawler workflow is
  never affected
- [ ] AC5: `/api/offers/{id}/similar` never returns the source offer or an
  expired offer, and returns category-based results when the source offer has
  no embedding or `$vectorSearch` throws
- [ ] AC6: On the eval set, hybrid search recall@5 ≥ keyword-only recall@5
- [ ] AC7: `/api/offers?q=` falls back to keyword-only when query embedding
  fails, with the same response shape and no 5xx
- [ ] AC8: `POST /api/ask` returns citations whose `offerId`s are all a subset
  of the retrieved offers and all non-expired; any LLM-cited id not in the
  retrieved set is dropped server-side before responding
- [ ] AC9: When retrieval returns zero offers, `/api/ask` responds with an
  answer stating no matching offers were found and an empty `citations` array,
  without calling the LLM
- [ ] AC10: `/api/ask` is rate limited per IP (429 when exceeded) and returns
  400 for an invalid body and 503 when the LLM/vector search is unavailable
- [ ] AC11: Offer text passed to the LLM is wrapped as clearly delimited
  untrusted data, and the system prompt instructs the model to ignore
  instructions inside it
- [ ] AC12: The ask box renders answer, citations, and fallback states with
  the `data-testid`s above

## Test Cases

| Test | Type | AC |
|------|------|----|
| eval script computes recall@5 for three strategies on a fixture corpus | unit (`eval.test.ts`) | AC2 |
| enrichment embeds new offers, skips unchanged hash, re-embeds changed | unit (`crawler/enrichment/embedOffers.test.ts`, mocked provider) | AC3 |
| provider throws/429 mid-batch → logged, remaining offers processed | unit | AC4 |
| vector helper always adds non-expired pre-filter | unit (`src/lib/.../vectorSearch.test.ts`) | AC5 |
| `/similar` excludes source + expired; falls back on missing embedding; falls back on `$vectorSearch` throw | unit (`similar/route.test.ts`) | AC5 |
| RRF merges two ranked lists deterministically | unit (`hybrid.test.ts`) | AC6 |
| `/api/offers?q=` keyword fallback on embed failure, same shape | unit (`route.test.ts`) | AC7 |
| `/api/ask` drops hallucinated citation ids; only non-expired | unit (`ask/route.test.ts`) | AC8 |
| `/api/ask` zero retrieval → no LLM call, empty citations | unit | AC9 |
| `/api/ask` 400 invalid body, 429 rate limited, 503 LLM down | unit | AC10 |
| prompt builder wraps offer text in delimiters + includes ignore-instructions line | unit (`buildAskPrompt.test.ts`) | AC11 |
| AskBox renders loading, answer + citations, fallback | component (`AskBox.test.tsx`) | AC12 |
| home page ask flow with `/api/ask` mocked → answer + citation link navigates to offer | e2e (`e2e/ask-offers.spec.ts`, resilient SSR pattern) | AC12 |
| hybrid ≥ keyword recall@5 on live Atlas eval | integration | AC6 — `// TODO: integration test needs real DB` |
| backfill populates all active offers | integration | AC3 — `// TODO: integration test needs real DB` |

## Edge Cases
- Embedding dimension change (model swap) → vectors with a different
  `embeddingModel` are treated as stale and re-embedded; the index must be
  rebuilt — document the procedure
- Query embedding latency > 1.5 s → treat as failure and use keyword-only
- Sinhala/Tamil queries → evaluated in the eval set (at least 2 queries)
- Prompt-injection text inside a scraped offer → cannot change the answer
  format or cause citations outside the retrieved set (AC8 enforces this
  server-side regardless of model behaviour)
- Free-tier quota exhaustion on a public site → 503 + fallback UI, never a
  paid overage

## Architecture Decision
_To be completed in Stage 0 (AC1)._

## Documentation Impact
- `README.md`: architecture section (vector index, hybrid search, `/api/ask`),
  enrichment pipeline description, roadmap item for #188
- `CLAUDE.md`: environment variables section if any new key is needed (aim for
  none — reuse `GEMINI_API_KEY`/`GROQ_API_KEY`); architecture tree if new
  `src/lib/` modules are added
- `specs/api/openapi.yaml`: add `/ask` (implementing PR)

## Notes
- Related: spec 044 (`semanticSummary`, reserved `embedding`), 013 (Atlas
  Search), 046 (`/similar`), 057 (LLM provider router), #95.
- Follow-up: #190 (agent search) builds on Stages 2–5.
