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

### GitHub Spec Kit (`/speckit-*` skills)

This repo also has [GitHub Spec Kit](https://github.com/github/spec-kit) installed
(`.specify/` + `.claude/skills/speckit-*`), the same tooling used in `autoshop-takumi`.
Use it for larger or more ambiguous features that benefit from an explicit
spec → clarify → plan → tasks → implement pipeline; keep using a plain
`specs/features/NNN-slug.md` file (per the template above) for small, well-understood
changes. Both conventions coexist under `/specs/` — spec-kit creates its own
`specs/<NNN>-<slug>/` directories and never touches `specs/features/`.

| Skill | Use when |
|-------|----------|
| `/speckit-constitution` | Amending `.specify/memory/constitution.md` (project principles/governance) |
| `/speckit-specify` | Starting a new feature from a natural-language description → `specs/<NNN>-<slug>/spec.md` |
| `/speckit-clarify` | Resolving ambiguity in a spec before planning (max 5 targeted questions) |
| `/speckit-plan` | Generating `plan.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md` |
| `/speckit-tasks` | Generating a dependency-ordered `tasks.md` from spec + plan |
| `/speckit-checklist` | Generating a requirements-quality checklist (not a test plan) for a feature |
| `/speckit-analyze` | Read-only cross-check of spec/plan/tasks for gaps, ambiguity, constitution violations |
| `/speckit-implement` | Executing `tasks.md` end-to-end |
| `/speckit-converge` | After `/speckit-implement`, appending any remaining unbuilt work as new tasks |
| `/speckit-taskstoissues` | Converting `tasks.md` into GitHub issues |

The project constitution lives at `.specify/memory/constitution.md` — it summarizes
the same rules as this file (spec-first, test-every-change, Zod as source of truth,
no raw MongoDB, etc.) for spec-kit's own workflow to enforce. When the two disagree,
this file (`CLAUDE.md`) is authoritative — treat the mismatch as a sign the
constitution needs amending via `/speckit-constitution`.

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

Cloudflare Workers scraping PoC (spec 072 — feature-flagged, opt-in)
  └── /workers/scraper.js   → standalone Worker relaying fetches through Cloudflare's
                              edge (own runtime scope — excluded from root tsconfig/eslint)
  └── /scripts/verify-workers.ts → manual PoC verification against blocked bank URLs

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
- `AUTH_SECRET` — random secret for encrypting NextAuth session JWTs
- `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` — Google OAuth credentials for the admin dashboard
- `ADMIN_EMAIL` — the single Google account allowed to access `/admin`
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` — Redis for API rate limiting (omit locally to skip)
- `VERCEL_REVALIDATION_SECRET` — protects the `/api/revalidate` ISR endpoint
- `BRANDFETCH_API_KEY` — secondary logo fallback (free tier: 50 calls/month)
- `GEMINI_API_KEY` — Google Gemini API key for the AI offer-enrichment workflow (`crawler/enrichment/run.ts`) — free-tier eligible, see #95
- `GROQ_API_KEY` — optional second, text-only LLM provider for offer enrichment (spec 057) — spills semantic-summary calls to Groq once Gemini's per-minute window is exhausted; omitting it is a fully supported, zero-behavior-change (Gemini-only) configuration
- `WORKER_SCRAPE_URL` / `WORKER_SECRET` — optional Cloudflare Workers scraping PoC (spec 072); registers an additional `workers` scraping-proxy provider that relays fetches through a deployed `workers/scraper.js` Worker instead of the GH Actions runner's IP. Omitting `WORKER_SCRAPE_URL` is a fully supported, zero-behavior-change (pre-072 provider list) configuration
- `GITHUB_FEEDBACK_TOKEN` — GitHub PAT with `issues:write` scope; used to create issues from feedback
- `GITHUB_REPO_OWNER` / `GITHUB_REPO_NAME` — defaults to `chamirusenarath96` / `card-max`

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
| American Express (NTB) | americanexpress.lk | `crawler/scrapers/amex.ts` |
| People's Bank | peoplesbank.lk | `crawler/scrapers/peoples_bank.ts` |
| Bank of Ceylon | boc.lk | `crawler/scrapers/boc.ts` |

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

Two scheduled agents maintain the project autonomously, driven by a **GitHub Issue lifecycle**:

```
(untriaged issue) ──spec-writer──▶ spec-drafted ──human, manual──▶ approved ──implementer──▶ in-progress ──implementer──▶ closed
```

- Every feature/bug starts as a plain GitHub issue (short description, no label) — **except** issues auto-created by a failing pipeline (`crawler.yml`, `enrich.yml`, `ci.yml`'s `migrate`/`deploy` jobs), which are created pre-labeled `bug` + `urgent` (plus a category label: `crawler`/`enrichment`/`deploy`).
- `card-max-spec-writer` drafts a spec for it, links the spec back to the issue with a `**GitHub Issue**: #N` line in the spec file, comments on the issue with the spec path, and labels it `spec-drafted`. **Any untriaged issue labeled both `bug` and `urgent` is drafted first**, ahead of older non-urgent issues — this is how a broken pipeline gets a fix spec'd before routine feature work, without a human having to manually reprioritize anything.
- **A human reviews the spec and manually swaps the label to `approved`** — this is the only manual gate in the pipeline; nothing is implemented without it.
- **Optional: a human can additionally label an `approved` issue `priority`** to fast-track it. `card-max-implementer` always checks for `approved`+`priority` issues first and picks the oldest of those ahead of any older plain-`approved` issue. Priority never skips the recovery step — any unfinished `in-progress` work from a prior run is always resumed/cleared first, so a priority flag can never cause abandoned work. "ASAP" is bounded by the task's own schedule (see table below) — flagging an issue `priority` doesn't trigger an out-of-band run; it just wins the next scheduled run's selection. Manually clicking "Run now" on the task is the only way to get an immediate run.
- `card-max-implementer` only ever picks up issues labeled `approved` (optionally `priority`), flips the chosen one to `in-progress` while it works, and closes the issue once the PR is merged. It also has a recovery check for stale `in-progress` issues left over from a run that failed mid-way.
- The 41 specs written before this workflow existed (no `**GitHub Issue**` line) fall back to the legacy signal: an unchecked `- [ ]` item in `README.md`'s "Known Limitations & Roadmap" section.

| Task ID | Schedule | Purpose |
|---------|----------|---------|
| `card-max-spec-writer` | Daily | Finds untriaged open issues → drafts `bug`+`urgent` ones first, then the rest oldest-first → commits spec-only changes to master → comments + labels the issue `spec-drafted`. Never touches `approved`/`priority`/`in-progress` labels or closes issues. |
| `card-max-implementer` | Daily | Clears any unfinished `in-progress` work first, then picks the oldest `priority`-labeled `approved` issue if any exist, otherwise the oldest plain `approved` issue → implements → tests → verifies CI → merges the PR → closes the issue |

**Lifecycle labels** (`spec-drafted`, `approved`, `in-progress`, `urgent`) — created automatically by `card-max-spec-writer` on first run if they don't already exist on the repo.

**Severity/priority labels** (informational, layered on top of the lifecycle — never removed by either agent except where noted):
- `bug` — GitHub's built-in default label; used on any issue describing broken behavior
- `urgent` — combined with `bug`, jumps the queue for spec-writing (see above). All four pipeline failure-notification steps (`crawler.yml`, `enrich.yml`, `ci.yml`'s `migrate` and `deploy` jobs) create their issues with `['bug', 'urgent', <category>]` automatically
- `priority` (optional, human-applied fast-track on top of `approved`) — jumps the queue for *implementation*, not spec-writing. Not auto-created — GitHub lets you create it inline the first time you apply it from the issue's label picker, or run `gh label create priority --repo chamirusenarath96/card-max --color "d93f0b" --description "Fast-track: card-max-implementer picks this before other approved issues"`

Note the two queue-jumps are independent and cover different stages: `urgent` (+`bug`) affects which untriaged issue gets a spec drafted next; `priority` affects which already-`approved` issue gets implemented next. A pipeline-failure issue naturally benefits from both in sequence — `urgent` gets it spec'd quickly, and a human can add `priority` after approving that spec to also fast-track its implementation.

Both tasks read this file (`CLAUDE.md`) and the `.claude/commands/` directory for implementation guidance. Do not duplicate rules here that are already in those command files.

---

## Claude Commands (slash commands)

Slash commands live in `.claude/commands/` — use these when implementing features:

| Command | Use when |
|---------|----------|
| `/add-bank <bank-name>` | Adding a new bank scraper to the crawler |
| `/run-migration <description>` | Writing and running a DB migration script |

Agents live in `.claude/agents/` — invoked via the Agent tool:

| Agent | Use when |
|-------|----------|
| `new-page` | Scaffolding a new Next.js page with spec, component tests, and E2E |
