<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# card-max — Agent Guidelines

This file provides additional context for AI agents and automated tools working in this repository.

## Project summary

**card-max** is a Sri Lankan credit card offers aggregator. A daily GitHub Actions crawler scrapes offers from four banks into MongoDB Atlas. A Next.js 16 (App Router) frontend displays and filters those offers, deployed on Vercel.

## Non-obvious architecture decisions

- `searchParams` in App Router pages is a **Promise** and must be `await`-ed — see `src/app/page.tsx`
- All API endpoints are under `src/app/api/`; they use Mongoose models, never raw MongoDB
- The Zod schema at `specs/data/offer.schema.ts` is the single source of truth — if you change the data model, change the schema first and let TypeScript propagate the errors
- `BANK_METADATA` in `offer.schema.ts` controls both the data enum AND the brand colours shown in the UI — always update both together
- Client components are in `src/components/`; they use URL params (not React state) as the source of truth for filters and search

## Slash commands (project skills)

Project-level skills are in `.claude/commands/`. Use them as starting templates:

| Command | Purpose |
|---|---|
| `/add-bank` | Add a new Sri Lankan bank scraper end-to-end |
| `/new-page` | Scaffold a new Next.js App Router page with tests |
| `/new-github-action` | Create a new GitHub Actions workflow |

## Testing conventions

- Unit/component tests: Vitest + Testing Library — `npm run test`; colocated as `*.test.tsx`
- E2E tests: Playwright — `npm run test:e2e`; in `e2e/`; always mock `**/api/offers**` via `page.route()` so tests don't need a live DB
- Use `@/test-utils` (not `@testing-library/react` directly) — it wraps with required providers
- CI blocks merges on any test failure

## Committing

- Branch naming: `feature/`, `fix/`, `chore/`, `spec/`
- Commit format: `feat:`, `fix:`, `chore:`, `spec:`, `test:`
- PRs must have CI green before merging
- Never commit `.env.local` or secrets
