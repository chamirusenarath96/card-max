# Feature: AI Offer Enrichment v2 Architecture Decision (064)

**GitHub Issue**: #95

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [ ] Implementation started
- [ ] Tests written
- [ ] Done

## Purpose
Decide whether to adopt an event-driven Kafka + n8n pipeline for AI offer enrichment (v2) or retain the GitHub Actions batch approach shipped in 044. The crawler produces new offers once daily; enrichment must be zero ongoing cost and not introduce always-on operational surface unless justified by broader streaming needs.

## Scope

### In Scope
- Evaluate proposed Kafka + n8n architecture (MongoDB Change Streams -> Kafka -> n8n -> enrichment -> upsert -> /api/revalidate) against the shipped GitHub Actions workflow_run approach (second workflow triggered when daily crawler completes, queries enrichmentStatus pending, calls AI provider, upserts, then revalidates)
- Zero-cost constraint: no paid broker, no paid always-on host, no new billed service
- Operational cost: hosting, uptime, credentials, and maintenance surface
- Decision for v2: adopt Kafka+n8n only if shared streaming infrastructure is needed beyond enrichment; otherwise keep workflow_run
- Clarify Claude.ai plan vs Anthropic API billing for Claude usage; confirm free-tier LLM alternatives (Gemini, Groq) for vision path

### Out of Scope
- Re-implementing enrichment already shipped in 044 (query pending, AI call, upsert, revalidate) — that remains the baseline
- New offer consumers beyond enrichment (future streaming consumers are only evaluated as justification, not implemented here)
- Changing crawler schedule, offer schema, or /api/revalidate caching (see CLAUDE.md Caching Architecture)
- Announce banner (#91) — unaffected

## Data Contract
References: specs/data/offer.schema.ts — OfferSchema (no schema change). Existing fields enrichmentStatus, semantic fields, and image extraction outputs remain as defined in 044.

## API Contract
No new card-max API endpoints. Existing endpoint GET /api/offers and POST /api/revalidate (Vercel ISR) are reused. External calls are to AI providers (Gemini/Groq/Claude) already abstracted in crawler/enrichment/ per 057.

### Endpoints
```
GET /api/offers
POST /api/revalidate
```
See specs/api/openapi.yaml.

## UI Behaviour
No new UI. Enrichment remains invisible to end users except via richer offer detail (semantic summary, conditions). The decision has no direct user interaction; failure modes are logged in workflow runs, not surfaced in UI.

## Acceptance Criteria
- [ ] AC1: Spec documents the decision: retain GitHub Actions workflow_run batch enrichment for v2; do not introduce Kafka + n8n as single-purpose infrastructure for enrichment alone
- [ ] AC2: Spec records cost/operational analysis: Kafka (self-hosted/Debezium or Upstash free-tier REST/poll) + n8n both require an always-on consumer/host, adding uptime/restarts/credentials vs serverless/ephemeral (Actions + Vercel + Atlas M0) which incurs no new host
- [ ] AC3: Spec states the condition under which Kafka+n8n would be adopted: only if a concrete second (or more) consumer of a new-offer event stream exists, scoped as shared infrastructure with its own cost/host justification
- [ ] AC4: Spec clarifies Claude usage: Claude.ai plan subscription does not automatically cover Anthropic API billing; API-key usage requires separate API billing — if Claude is retained, confirm billing, otherwise prefer genuinely free-tier vision LLMs (Gemini/Groq per 057) for image extraction
- [ ] AC5: Spec is linked from #95 and issue is labeled spec-drafted; no code change is required to satisfy this spec (decision-only)

## Test Cases

| Test | Type | AC |
|------|------|----|
| Spec file exists at specs/features/064-ai-offer-enrichment-v2-architecture-decision.md and contains GitHub Issue #95 line | unit | AC1 |
| Spec documents workflow_run as the retained approach and explicitly rejects single-purpose Kafka+n8n | unit | AC1, AC2 |
| Spec lists operational surface comparison (always-on host vs serverless) | unit | AC2 |
| Spec states shared-infrastructure condition for future Kafka+n8n adoption | unit | AC3 |
| Spec clarifies Claude plan vs API billing and notes Gemini/Groq free-tier alternative | unit | AC4 |

## Edge Cases
- Future requirement for true real-time streaming (e.g., multiple consumers) emerges — re-open as new spec scoped as shared infrastructure, not as enrichment-only change
- Upstash Kafka free-tier REST/poll is considered zero-cost but still needs a poll loop/host; evaluate against workflow_run simplicity for once-daily upstream
- Enrichment volume ~700 offers/day fits within GitHub Actions free minutes and AI provider free tiers; no broker needed for scale
- If API billing for Claude is unavailable, enrichment must fall back to Gemini/Groq without blocking the pipeline

## Documentation Impact
None. If a future shared streaming decision is made, update README.md and CLAUDE.md Architecture and Scheduled Automation sections and add the new workflow/infra docs. This decision-only spec requires no doc change now.

## Notes
- Context: 044 chose separate GitHub Actions workflow triggered after daily crawl via workflow_run — that is the shipped baseline. This issue (#95) asks whether to replace/extend it with Kafka + n8n.
- The friction is intentional to surface: Kafka + n8n needs something always-on to listen/consume, while the project is otherwise entirely serverless/ephemeral (Actions cron, Vercel functions, Atlas M0). Zero-cost managed pieces exist (Upstash Kafka REST, self-hosted n8n free) but still need a persistent VM/container.
- Alternative retained: second workflow via workflow_run querying Mongo for enrichmentStatus pending, calling AI provider directly, upserting, then calling /api/revalidate — reuses the trigger pattern already in .github/workflows/ and needs no broker or always-on consumer.
- Depends on #79 and 044; related #91 unaffected. Decide before implementation — no code in this spec.
