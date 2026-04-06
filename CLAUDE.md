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
- Branch naming: `feature/`, `fix/`, `chore/`, `spec/`
- Commit format: `feat:`, `fix:`, `chore:`, `spec:`, `test:`
- PRs must have CI green before merge
- Never commit `.env.local` or secrets
