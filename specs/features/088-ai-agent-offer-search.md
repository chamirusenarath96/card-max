# Feature: AI Agent Offer Search (088)

**GitHub Issue**: #190

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [ ] Implementation started
- [ ] Tests written
- [ ] Done

## Purpose
Let users ask multi-part questions in natural language, e.g. *"I have a Sampath
Visa and an HNB Mastercard, where should I eat seafood in Colombo this
Saturday?"*, and get an answer that cites real offers. Unlike the single-shot
RAG endpoint from spec 087 (#188), an agent can take several bounded steps:
ask one clarifying question, run several searches, apply structured filters,
compare across cards, and then answer with links to the offers it used.

**Blocked by #188 / spec 087.** Implementation must not start until spec 087
Stages 2–4 (vector helper, semantic `/similar`, hybrid `?q=`) have shipped.

## Scope

### In Scope
- New `POST /api/agent` streaming endpoint (Server-Sent Events or a
  `ReadableStream` of newline-delimited JSON events). Request:
  `{ messages: { role: "user" | "assistant", content: string }[] }`
  (Zod-validated: 1–20 messages, each ≤ 1000 chars; conversation state is
  held by the client, nothing stored server-side)
- Agent loop using the spec-057 LLM provider router with tool/function
  calling. Tools are thin server-side wrappers over **existing service
  functions** (the same code paths the HTTP routes use — no direct Mongoose
  queries written for the agent):
  - `search_offers({ query?, bank?, category?, offerType?, minDiscount?, activeOn? })`
    → hybrid search + filters from `GET /api/offers` (spec 087 Stage 4)
  - `similar_offers({ offerId })` → `/api/offers/{id}/similar`
  - `get_offer({ offerId })` → `/api/offers/{id}`
  - `ask_user({ question })` → ends the turn with a clarifying question
- Hard limits per turn: max **5** tool calls, max **2** LLM retries, max
  output tokens configurable (default 800), overall turn timeout **25 s**
- Every tool result returns at most 10 offers, and only these fields to the
  LLM: `_id, title, merchant, bankDisplayName, category, offerType,
  discountLabel, validFrom, validUntil` — scraped free text (description,
  terms) is excluded from tool results to shrink the prompt-injection surface
- Final event: `{ type: "answer", text, offerIds: string[] }`. Server
  validates `offerIds` against the union of offers returned by tools during
  that turn and drops any others, and drops expired offers
- Per-IP rate limit via the existing Upstash limiter in `src/middleware.ts`
  (separate, stricter bucket than `/api/ask`)
- UI: an **"Ask" mode** in `SearchDrawer` (`Ctrl+K`) toggled by a tab;
  streamed text, a "thinking…/searching…" status line per tool call, and
  recommended offers rendered with the existing offer card component
- Fallback: when the agent returns 429/503 or times out, the UI shows a
  message and runs the user's text as a normal search in the drawer

### Out of Scope
- User accounts, saved card wallets, or server-side conversation memory
  (in-session memory lives in client state only and is cleared on reload)
- Booking, payments, or any action outside reading offers
- New paid LLM providers
- Voice input

## Data Contract
References: `specs/data/offer.schema.ts` — `OfferSchema` (read-only; the agent
projects the fields listed above). Tool argument schemas are defined with Zod
and reuse enums from `OfferSchema` (`bank`, `category`, `offerType`) and
`OfferQuerySchema` where they exist. No schema changes.

## API Contract
**New** `POST /api/agent` — streaming; event types: `status`
(`{ type: "status", tool: string }`), `clarify` (`{ type: "clarify", question }`),
`answer` (as above), `error` (`{ type: "error", code: "rate_limited" | "unavailable" | "timeout" }`).
Non-streaming errors: 400 invalid body, 429 rate limited.
`specs/api/openapi.yaml` must be updated by the implementing PR.

## UI Behaviour
- `Ctrl+K` drawer has tabs "Search" / "Ask" (`data-testid="search-mode-tab"`,
  `data-testid="ask-mode-tab"`)
- Ask mode: textarea (`data-testid="agent-input"`), transcript
  (`data-testid="agent-transcript"`), status line while tools run
  (`data-testid="agent-status"`), recommended offers as offer cards
  (`data-testid="agent-offer-{offerId}"`), clarifying question shown as an
  assistant message the user can reply to
- Error/fallback banner (`data-testid="agent-fallback"`) with normal search
  results below it
- Respects `prefers-reduced-motion` (no animated streaming cursor)

## Acceptance Criteria
- [ ] AC1: A question produces a streamed `answer` event whose `offerIds` all
  came from tool results in the same turn and are non-expired; others are
  dropped server-side
- [ ] AC2: The agent only accesses offers through the four listed tools;
  tool implementations call existing service functions shared with the HTTP
  routes (asserted by mocking those functions)
- [ ] AC3: A turn never exceeds 5 tool calls or 25 s; on hitting either limit
  the agent answers with what it has, or emits `error: timeout` if it has nothing
- [ ] AC4: An ambiguous request (e.g. no card or date mentioned when the
  question depends on it) can yield a `clarify` event instead of an answer;
  the follow-up user message continues the same conversation
- [ ] AC5: When no tool call returns offers, the answer states nothing matched
  and `offerIds` is empty
- [ ] AC6: Tool results sent to the LLM contain only the whitelisted fields
  (no description/terms text)
- [ ] AC7: `/api/agent` returns 400 on invalid body and 429 when the per-IP
  limit is exceeded; LLM/provider outage emits `error: unavailable`
- [ ] AC8: The drawer's Ask mode renders transcript, status, offer cards,
  clarifying question, and fallback states with the `data-testid`s above
- [ ] AC9: On `rate_limited`/`unavailable`/`timeout`, the UI shows the
  fallback banner and normal search results for the same text
- [ ] AC10: An evaluation script runs ≥ 10 realistic multi-step questions
  (reusing spec 087's labelled set where applicable) and reports how many
  answers cite at least one expected offer; result recorded in the PR

## Test Cases

| Test | Type | AC |
|------|------|----|
| answer offerIds filtered to tool-returned + non-expired | unit (`agent/route.test.ts`, mocked LLM + services) | AC1 |
| each tool delegates to the shared service function with mapped args | unit (`agentTools.test.ts`) | AC2 |
| LLM requesting a 6th tool call is stopped; answer emitted | unit (`agentLoop.test.ts`) | AC3 |
| fake clock past 25 s → timeout handling | unit | AC3 |
| LLM `ask_user` call → `clarify` event; second request continues | unit | AC4 |
| all tools return [] → "nothing matched" answer, empty offerIds | unit | AC5 |
| serialized tool result contains only whitelisted keys | unit | AC6 |
| 400 invalid body (too many/too long messages), 429 limited, provider throw → `unavailable` | unit | AC7 |
| AskMode renders transcript/status/cards/clarify from a mocked stream | component (`SearchDrawer.test.tsx` / `AgentPanel.test.tsx`) | AC8 |
| AskMode error event → fallback banner + search results | component | AC9 |
| Ctrl+K → Ask tab → submit question (mocked `/api/agent` stream) → offer card visible and links to detail | e2e (`e2e/agent-search.spec.ts`) | AC8 |
| mocked 429 → fallback banner + normal results | e2e | AC9 |
| eval script reports hit-rate on fixture corpus | unit (`agentEval.test.ts`) | AC10 |
| live eval against real Atlas + LLM | integration | AC10 — `// TODO: integration test needs real DB` |

## Edge Cases
- Prompt injection inside scraped offer text: mitigated by excluding free
  text from tool results (AC6) and server-side `offerIds` validation (AC1)
- User asks for something unrelated to offers → short refusal + suggest a
  search; no tool calls required
- User claims cards the bank list doesn't include → agent says it has no
  offers for that bank
- Provider's tool-calling unsupported on the fallback provider (e.g. Groq model
  without tools) → `error: unavailable` rather than an ungrounded answer
- Very long conversation → client trims to the last 20 messages before sending

## Documentation Impact
- `README.md`: architecture section (agent endpoint, tools, limits), roadmap
  item for #190
- `CLAUDE.md`: architecture tree if new `src/lib/agent/` modules are added;
  no new env vars expected
- `specs/api/openapi.yaml`: add `/agent` (implementing PR)

## Notes
- Depends on spec 087 (#188); reuse its hybrid search helper, eval set, and
  prompt-delimiting approach.
- Related: spec 057 (provider router), `src/components/search/SearchDrawer.tsx`,
  `HeroSearch.tsx`.
