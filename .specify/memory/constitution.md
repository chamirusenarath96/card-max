# Card-Max Constitution

## Core Principles

### I. Spec Before Code
No feature is implemented without a spec in `specs/` (either a spec-kit
`specs/<NNN>-<slug>/spec.md` or a classic `specs/features/<NNN>-slug.md`)
satisfying all its acceptance criteria. If a spec is missing, write it first.
Code must not be merged without a spec, except chore/config-only changes.

### II. The Zod Schema Is the Single Source of Truth
`specs/data/offer.schema.ts` defines the offer data model. It is never
duplicated — Mongoose models in `/src/lib/models/` derive from it, and all
API inputs/DB outputs are validated against it at runtime. A feature that
introduces a parallel shape for offer data is out of spec.

### III. Every Change Ships With a Test (NON-NEGOTIABLE)
No code change merges without a matching test in the same PR:
- React component → colocated `*.test.tsx` (Vitest + Testing Library)
- API route → `route.test.ts` covering valid input, invalid input (400),
  not-found (404), server error (500)
- Crawler scraper → `crawler/scrapers/<bank>.test.ts` against fixture
  HTML/JSON, covering parse success, invalid-item skip, and HTTP failure
- New page route → `e2e/<slug>.spec.ts` (Playwright), using the resilient
  SSR pattern (accept both content and not-found states — CI has no DB)
Every `data-testid` used in a component must be asserted by at least one
test, and every row in a spec's Test Cases table must map to a test.

### IV. No Raw MongoDB, No Hardcoded Design Tokens
Database access always goes through Mongoose models in `/src/lib/models/`
— never raw driver calls. UI code always uses semantic Tailwind tokens
(`bg-background`, `text-foreground`, `border-border`, etc.) — never
hardcoded colors like `bg-white` or `text-gray-900`. Dark mode is handled
automatically by these tokens and must never be special-cased.

### V. TypeScript Strict, No Escape Hatches
`no any`, no `@ts-ignore` without an explanatory comment. `npm run
type-check` must exit 0 before every push — this is not negotiable for
speed.

### VI. Simplicity Over Premature Abstraction
No new dependency, abstraction, or configurability without a concrete
current need. A bug fix doesn't need surrounding cleanup; a one-shot
migration script doesn't need a reusable framework.

## Technology Constraints

- **Framework**: Next.js 16 App Router on Vercel; pages/layouts in
  `/src/app/`, API routes as serverless functions in `/src/app/api/`.
- **Database**: MongoDB Atlas via Mongoose, connection helper in
  `/src/lib/db/`.
- **Crawler**: one scraper file per bank in `/crawler/scrapers/`, run daily
  via GitHub Actions cron; every scraper calls `parseDiscount()` from
  `crawler/utils/parseDiscount.ts` and spreads the result into each offer.
- **Styling**: Tailwind only — no CSS modules, no styled-components.
- **Icons**: Lucide React only.
- **Validation**: Zod for all runtime validation of API inputs and DB
  outputs.

## Development Workflow

- Never commit directly to `master`, except spec-only or README-only
  changes (see `CLAUDE.md` Git Conventions).
- Every feature: `feat/NNN-slug` branch → implement + tests → local
  verification gates (`type-check`, `lint`, `test`, `build`, all must exit
  0) → push → PR → poll CI to completion → squash-merge → delete branch.
- CI runs `ci` (lint → type-check → unit → build) → `e2e` → `migrate` →
  `deploy` in sequence on every push to master and every PR. Never merge
  while any job is `in_progress` or `failure`.
- Branch/commit prefixes (`feat/`, `fix/`, `chore/`, `spec/`, `test/`) and
  PR description template are defined in `CLAUDE.md` — follow them exactly.

## Governance

This constitution supersedes ad-hoc practice for anything it covers. It is
subordinate to `CLAUDE.md`, which holds the authoritative, current
implementation-level detail (commands, env vars, bank list, workflow
mechanics) this document intentionally omits — when they conflict, treat it
as a sign this constitution needs amending, not that `CLAUDE.md` is wrong.
Amendments update this file directly with a clear reason in the commit
message.

**Version**: 1.0.0 | **Ratified**: 2026-07-31 | **Last Amended**: 2026-07-31
