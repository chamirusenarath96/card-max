# Feature: [Feature Name] (NNN)

## Status
- [ ] Spec drafted
- [ ] Spec reviewed
- [ ] Implementation started
- [ ] Tests written
- [ ] Done

## Purpose
<!-- 1-3 sentences: what problem does this feature solve? Who uses it? -->

## Scope
<!-- What is included. What is explicitly NOT included (out of scope). -->

### In Scope
-

### Out of Scope
-

## Data Contract
<!-- Which Zod schemas are used? Reference spec/data/ -->
References: `specs/data/offer.schema.ts` — `OfferSchema`, `OfferQuerySchema`

## API Contract
<!-- Reference openapi.yaml or define endpoints inline -->

### Endpoints
```
GET /api/offers
```
See `specs/api/openapi.yaml` for full request/response schema.

## UI Behaviour
<!-- Describe the user-facing behaviour. What does the user see? What can they do? -->

## Acceptance Criteria
<!-- These become test cases. Be specific and testable. -->
- [ ] AC1: ...
- [ ] AC2: ...
- [ ] AC3: ...

## Test Cases
<!-- Map each AC to a test. Specify component test or e2e test. -->

| Test | Type | AC |
|------|------|----|
| renders X when Y | component | AC1 |
| user can do Z | e2e | AC2 |

## Edge Cases
<!-- What could go wrong? How should it behave? -->
- Empty state: show "No offers found"
- Network error: show error toast
- Expired offers: hidden by default

## Documentation Impact
<!--
Does this feature change the architecture, add/remove an API endpoint, add a new
GitHub Actions workflow or scheduled task, or change a documented SDLC/automation
process? If so, list exactly what needs updating in README.md and/or CLAUDE.md.
If nothing needs updating, write "None." Whoever implements this spec must actually
make those doc updates in the same PR — don't just note it here and leave it undone.
-->
-

## Notes
<!-- Anything else the developer should know -->
