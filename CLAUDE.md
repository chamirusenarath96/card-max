# card-max — Claude Code Guidelines

## Project Overview
**card-max** is a Sri Lankan credit card offers aggregator. A daily crawler scrapes offer pages from major banks and stores them in MongoDB Atlas. The Next.js frontend displays and filters those offers.

## Spec-Driven Development
> **IMPORTANT**: Before writing any code for a feature, read the relevant spec file in `/specs/features/`.
> Code must satisfy ALL acceptance criteria defined in the spec. If a spec is missing, create it first.

- Specs live in `/specs/`
- The Zod schema at `specs/data/offer.schema.ts` is the **single source of truth** for the data model
- API contracts are defined in `specs/api/openapi.yaml`
- Feature specs follow the template in `specs/features/_template.md`

## Architecture
```
Next.js 16 (App Router) on Vercel
  └── /src/app/             → pages and layouts
  └── /src/app/api/         → API routes (serverless functions)
  └── /src/components/      → React components
  └── /src/lib/db/          → MongoDB connection helper
  └── /src/lib/models/      → Mongoose models (derived from Zod schema)

Crawler (GitHub Actions daily cron)
  └── /crawler/scrapers/    → one scraper file per bank
  └── /crawler/utils/       → shared helpers (http, parse, db)
  └── /crawler/run.ts       → entrypoint

Specs (source of truth before code)
  └── /specs/data/          → Zod schemas
  └── /specs/features/      → feature specs with acceptance criteria
  └── /specs/api/           → OpenAPI contract

Tests
  └── /src/**/*.test.tsx    → Vitest component tests (colocated)
  └── /e2e/                 → Playwright e2e tests
```

## Commands
```bash
npm run dev          # start Next.js dev server
npm run crawler      # run crawler locally (needs .env.local)
npm run test         # Vitest component/unit tests
npm run test:e2e     # Playwright e2e tests
npm run build        # production build
npm run lint         # ESLint
npm run type-check   # TypeScript strict check
```

## Environment Variables
Copy `.env.example` to `.env.local` and fill in:
- `MONGODB_URI` — MongoDB Atlas connection string (required)

## Coding Standards
- **TypeScript strict mode** — no `any`, no `@ts-ignore` without comment
- **Zod for all validation** — validate all API inputs and DB outputs at runtime
- **No raw MongoDB** — always use Mongoose models defined in `/src/lib/models/`
- **Spec first** — update or create spec before implementing a feature
- **Colocated tests** — every new component needs a `*.test.tsx` alongside it
- **Tailwind only** — no CSS modules, no styled-components

## Testing Rules
- Unit/Component: Vitest + Testing Library — run with `npm run test`
- E2E: Playwright — run with `npm run test:e2e` — tests live in `/e2e/`
- CI runs ALL tests on every PR — do not merge with failing tests

## Banks Supported
| Bank | URL | Scraper |
|------|-----|---------|
| Commercial Bank | combank.lk | `crawler/scrapers/combank.ts` |
| Sampath Bank | sampath.lk | `crawler/scrapers/sampath.ts` |
| HNB | hnb.lk (API: venus.hnb.lk) | `crawler/scrapers/hnb.ts` |
| Nations Trust Bank | nationstrust.com | `crawler/scrapers/ntb.ts` |

## Offer Type System
Every offer is classified into one of 8 offer types stored in the `offerType` field.
The `discountPercentage` (number) field is populated for `percentage` and `cashback` types.
The `discountLabel` (string) field always holds the original human-readable text.

| offerType | Example discountLabel | discountPercentage |
|-----------|----------------------|-------------------|
| `percentage` | "Up to 45% off" | 45 |
| `cashback` | "10% cashback on spend" | 10 |
| `bogo` | "Buy 1 Get 1 Free" | — |
| `installment` | "0% interest – 12 months" | 0 |
| `fixed_amount` | "Rs. 1,000 off on bills" | — |
| `points` | "Double Points every Tuesday" | — |
| `free_item` | "Complimentary dessert" | — |
| `other` | "Special Ramadan offer" | — |

Classification logic lives in `crawler/utils/parseDiscount.ts`.
All scrapers call `parseDiscount()` and spread the result into each offer.

## Git Conventions

### Branch naming
| Prefix | When to use | Example |
|--------|-------------|---------|
| `feat/NNN-slug` | Implementing a spec | `feat/006-filter-presets` |
| `fix/slug` | Bug fix | `fix/offer-card-link` |
| `chore/slug` | Config, deps, tooling | `chore/update-playwright` |
| `spec/slug` | Spec-only changes | `spec/roadmap-specs-006-016` |
| `test/slug` | Test-only changes | `test/e2e-offer-detail` |

### Commit format
```
feat(NNN):   implementing a spec feature
fix:         bug fix
chore:       config / deps / tooling
spec(NNN):   spec file changes
test:        test-only changes
```

### Workflow — feature implementation (mandatory)

> **Every feature implementation — including automated agents — must follow this flow.**
> Direct commits to master are only allowed for spec-only or README-only changes.

```
1.  git checkout master && git pull origin master
2.  git checkout -b feat/NNN-slug
3.  Implement + write tests
4.  Run local verification gates (type-check, lint, test, build — all must pass)
5.  git push -u origin feat/NNN-slug
6.  gh pr create --base master --title "feat(NNN): <feature name>" --body "..."
7.  Poll CI until all jobs pass (see CI/CD Pipeline section)
8.  gh pr merge --squash --delete-branch
9.  git checkout master && git pull origin master
```

### Polling CI after a PR push

After opening or pushing to a PR, check status periodically — do not assume it passed:

```bash
# Get the PR's head SHA
SHA=$(gh pr view <PR-number> --repo chamirusenarath96/card-max --json headRefOid -q .headRefOid)

# List all workflow runs for that SHA
gh run list --repo chamirusenarath96/card-max --commit $SHA \
  --json name,status,conclusion,databaseId \
  --jq '.[] | "\(.name): \(.status) \(.conclusion) (id:\(.databaseId))"'
```

Poll every 60 seconds until every run shows `status=completed`.

- All `conclusion=success` → merge the PR
- Any `conclusion=failure` → fetch logs, fix, push to the branch, re-poll:
  ```bash
  gh run view <run-id> --repo chamirusenarath96/card-max --log-failed
  ```

**Never merge a PR while any job shows `status=in_progress` or `conclusion=failure`.**

### PR description template

```markdown
## Summary
- Implements `specs/features/NNN-slug.md`
- <bullet: what was built>
- <bullet: what tests were added>

## Acceptance criteria
- [x] AC1: ...
- [x] AC2: ...

## Test plan
- Unit/component: <N> tests in `src/.../Foo.test.tsx`
- E2E: <N> tests in `e2e/slug.spec.ts`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

### Never commit
- `.env.local` or any file containing secrets
- `node_modules/`
- `.next/` build output
- `playwright-report/`

---

## Local Verification Gates

Run all four in order before every push. All must exit 0:

```bash
npm run type-check   # TypeScript strict — zero errors allowed
npm run lint         # ESLint — zero errors allowed (warnings OK)
npm run test         # Vitest unit/component — all pass
npm run build        # Next.js production build — must succeed
```

E2E tests run in CI (they need a built server). Run locally only when changing
page routing or E2E specs:
```bash
npm run test:e2e     # Playwright — requires `npm run build` first
```

---

## Testing Standards

### Unit / Component tests (Vitest + Testing Library)

**Every new file that contains logic must have a colocated `*.test.tsx` or `*.test.ts`.**

| File type | Test file location | What to cover |
|-----------|-------------------|---------------|
| React component | `src/.../Component.test.tsx` | Renders correctly, user interactions, error states |
| API route | `src/app/api/.../route.test.ts` | Valid input, invalid input (400), not-found (404), server error (500) |
| Crawler scraper | `crawler/scrapers/<bank>.test.ts` | Parses fixture HTML/JSON correctly, skips invalid items, handles HTTP errors |
| Utility / hook | `src/.../<util>.test.ts` | All branches, edge cases, error paths |

**Test file conventions:**
```typescript
import { render, screen } from "@/test-utils";   // always use @/test-utils, not @testing-library/react directly
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock external I/O — never make real network calls or DB connections in unit tests
vi.mock("../utils/http", () => ({ fetchHtml: vi.fn(), fetchJson: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
```

**Coverage requirements:**
- Every `data-testid` attribute used in the component must be asserted in at least one test
- Every row in the spec's Test Cases table typed "unit" or "component" must map to a test
- Cover: happy path, empty/null state, error state, and the edge cases listed in the spec

### E2E tests (Playwright)

**Every new page route needs an `e2e/<slug>.spec.ts`.**

**Resilient SSR pattern** — Next.js server components fetch from DB server-side; CI has no DB. Always accept both outcomes:
```typescript
// Good — resilient to no-DB environment
const content = page.getByTestId("offer-detail");
const notFound = page.getByTestId("offer-not-found");
await expect(content.or(notFound)).toBeVisible({ timeout: 10000 });

// Bad — will always fail in CI without a DB
await expect(page.getByTestId("offer-detail")).toBeVisible();
```

**API mocking for client-side fetches:**
```typescript
await page.route("**/api/offers**", route =>
  route.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ data: [MOCK_OFFER], pagination: { page: 1, total: 1, totalPages: 1, limit: 20 } }) })
);
```

**Strict mode** — Playwright strict mode is on. Never use a locator that matches more than one element. Prefer `getByTestId` over `getByText` for structural elements.

**Every row in the spec's Test Cases table typed "e2e" must map to a test.**

### Test coverage gate
Before marking a spec Done, cross-reference the spec's full Test Cases table.
Every row must map to a test. If a row is "integration" (requires live DB), write a mock-based approximation and add a comment `// TODO: integration test needs real DB`.

---

## Component & UI Standards

### data-testid requirements
Every interactive element and every major layout section must have a `data-testid`:
```tsx
<section data-testid="offer-grid">
<button data-testid="filter-toggle">
<div data-testid="offer-card-{offer._id}">
```

### Design tokens — always use semantic Tailwind classes
| Use | ✅ Correct | ❌ Wrong |
|-----|-----------|---------|
| Text | `text-foreground`, `text-muted-foreground` | `text-gray-900` |
| Background | `bg-background`, `bg-card` | `bg-white` |
| Border | `border-border` | `border-gray-200` |
| Primary action | `bg-primary text-primary-foreground` | `bg-blue-600` |

Dark mode is handled automatically by shadcn semantic tokens — never hardcode colours.

### shadcn components already installed
`accordion` · `badge` · `button` · `calendar` · `card` · `dialog` · `input`
`navigation-menu` · `pagination` · `popover` · `separator` · `sheet`
`skeleton` · `table` · `tabs` · `toast` · `tooltip`

Install new ones with: `npx shadcn@latest add <component>`

### Icons
Lucide React only (`lucide-react`). No other icon libraries.

---

## CI/CD Pipeline

Defined in `.github/workflows/ci.yml`. Four jobs run in sequence on every push to master and every PR:

| Job | Runs after | What it does | Failure action |
|-----|-----------|-------------|----------------|
| `ci` | — | lint → type-check → unit tests → build | Blocks everything downstream |
| `e2e` | `ci` | Playwright E2E against production build | Blocks migrate + deploy |
| `migrate` | `ci` + `e2e` | Runs pending DB migration scripts | Creates a GitHub Issue, blocks deploy |
| `deploy` | all three | Vercel production deploy + cache invalidation | Creates a GitHub Issue |

**Verifying CI after a push:**
```bash
# List runs for the latest commit
gh run list --repo chamirusenarath96/card-max --limit 5

# Watch a specific run
gh run watch <run-id>

# Fetch logs for a failed job
gh run view <run-id> --log-failed
```

All four jobs must show `conclusion: success` before a feature is considered shipped.

---

## Scheduled Automation

Two scheduled agents maintain the project autonomously:

| Task ID | Schedule | Purpose |
|---------|----------|---------|
| `card-max-spec-writer` | Every 12 hours | Reads README roadmap → writes missing specs → commits to master |
| `card-max-implementer` | Every hour | Picks lowest unimplemented spec → implements → tests → verifies CI → marks README done |

Both tasks read this file (`CLAUDE.md`) and the `.claude/commands/` directory for implementation guidance. Do not duplicate rules here that are already in those command files.

---

## Claude Commands (slash commands)

Available in `.claude/commands/` — use these when implementing features:

| Command | Use when |
|---------|----------|
| `/add-bank` | Adding a new bank scraper to the crawler |
| `/new-page` | Adding a new Next.js page or route |
| `/new-github-action` | Adding a new CI/CD workflow |
| `/run-migration` | Writing and running a DB migration script |
