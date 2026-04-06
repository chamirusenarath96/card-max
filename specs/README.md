# Spec-Driven Development — card-max

## What is Spec-Driven Development?

Before any code is written, the feature is fully defined in a **spec file**. The spec describes:
- What the feature does
- What data it uses
- What the API looks like
- What the acceptance criteria are (checklist)
- What tests must pass

Claude Code (and human developers) read the spec and implement against it. The spec is the contract.

## Directory Structure

```
specs/
  README.md               ← this file
  data/
    offer.schema.ts       ← Zod schema (source of truth for all types)
  api/
    openapi.yaml          ← API contract (REST endpoints)
  features/
    _template.md          ← copy this when creating a new spec
    001-offer-listing.md  ← browse and filter offers
    002-crawler.md        ← daily scraping pipeline
    003-search.md         ← keyword search across offers
```

## Workflow

```
1. Create or update spec  →  2. Get spec reviewed  →  3. Implement code  →  4. Write tests  →  5. CI passes
       (spec/)                   (PR review)             (src/ or crawler/)     (*.test.tsx / e2e/)
```

## How to Create a New Spec

1. Copy `specs/features/_template.md` to `specs/features/NNN-feature-name.md`
2. Fill in all sections
3. Open a PR with just the spec file (prefix: `spec: ...`)
4. After approval, implement the feature in a follow-up PR

## Rules

- **Code must not be merged without a spec** (except chore/config work)
- **Acceptance criteria must be checkboxes** — CI will validate them against tests
- **The Zod schema in `specs/data/offer.schema.ts` is never duplicated** — import it everywhere
- **API changes update `specs/api/openapi.yaml` first**, then the implementation
