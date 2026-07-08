# Feature: Admin Dashboard with Google OAuth (039)

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [x] Implementation started
- [ ] Tests written
- [x] Done

## Purpose
Give the maintainer a single, authenticated web view of project health — CI status,
crawler freshness per bank, and user feedback — without needing to dig through GitHub
Actions logs or the MongoDB console directly.

## User Story
As the maintainer, I want to sign in with my Google account and see CI results, crawler
status per bank, and incoming feedback in one dashboard so that I can spot problems
quickly without leaving the app.

## Scope

### In Scope
- `/login` — Google OAuth sign-in page (Auth.js / `next-auth`), single allowed account
- `/admin` layout — server-side auth gate; redirects unauthenticated visitors to `/login`
- `/admin` (overview) — CI success rate, last deploy time, new feedback count, per-bank
  crawler freshness grid, latest test-suite run detail, 5 most recent feedback entries
- `/admin/ci` — full CI run history and per-check detail
- `/admin/crawler` — per-bank status table + `OffersTrendChart` (Recharts line chart)
- `/admin/feedback` — all feedback submissions + "Create GitHub Issue" action per row
- `AdminSidebar` — desktop sidebar / mobile top bar + bottom tab bar, shows signed-in
  user's avatar and name
- Auth restricted to a single email via the `signIn` callback in `auth.ts`

### Out of Scope
- Multi-admin / role-based access (single hardcoded `ADMIN_EMAIL` only)
- Editing offers or crawler config from the dashboard (read-only + feedback-to-issue only)
- Feedback submission itself — covered by the public `FeedbackWidget` (not in Roadmap,
  no dedicated spec)
- Session management UI (sign-out button lives in `AdminSidebar`, no separate spec needed)

## Data Contract
References: `specs/data/offer.schema.ts` — `OfferModel` (bank status aggregation).
New model: `FeedbackModel` (`src/lib/models/feedback.model.ts`) — not part of
`offer.schema.ts`; fields: `type`, `message`, `email?`, `status` (`new` | `converted`),
`issueUrl?`, `createdAt`.

No changes to the `Offer` Zod schema. `auth()` returns a `session.user` object
(`name`, `email`, `image`) sourced from the Google profile — not persisted to MongoDB.

## API Contract

### Endpoints used by the dashboard (all admin-only, session-gated)
```
GET  /api/feedback                    — list all feedback (admin only)
POST /api/feedback/:id/to-issue       — convert a feedback row to a GitHub issue
GET  https://api.github.com/repos/<owner>/<repo>/actions/workflows/ci.yml/runs
GET  https://api.github.com/repos/<owner>/<repo>/actions/runs/:id/jobs
GET  https://api.github.com/repos/<owner>/<repo>/deployments
```
The GitHub API calls are made server-side directly from the page components
(`src/app/admin/page.tsx`, `src/app/admin/ci/page.tsx`) using `GITHUB_FEEDBACK_TOKEN`
for auth when set, and are not proxied through a card-max API route.

### Auth routes
```
GET|POST /api/auth/[...nextauth]   — Auth.js catch-all handler (src/app/api/auth/[...nextauth]/route.ts)
```

## Technical Approach

This is a server-authenticated Next.js route tree — follow the `/new-page` command
conventions for route scaffolding, layout, and design tokens, plus Auth.js–specific
setup below (not covered by any of the four project commands).

### Route structure (per `/new-page` step 2)
```
src/app/login/page.tsx                     client component — Google sign-in button
src/app/admin/layout.tsx                   server component — auth gate + AdminSidebar
src/app/admin/page.tsx                     overview
src/app/admin/AdminSidebar.tsx             nav (client component)
src/app/admin/ci/page.tsx                  CI run history
src/app/admin/crawler/page.tsx             per-bank status + trend chart
src/app/admin/crawler/OffersTrendChart.tsx Recharts client component
src/app/admin/feedback/page.tsx            feedback list
src/app/admin/feedback/FeedbackActions.tsx "Create GitHub Issue" client action
```

### Auth setup (Auth.js / next-auth v5)
- `auth.ts` (project root) configures `NextAuth({ providers: [Google], callbacks: { signIn }, pages })`
- `signIn` callback rejects any profile whose `email` does not match
  `process.env.ADMIN_EMAIL` — effectively single-admin auth
- `pages.signIn` and `pages.error` both point at `/login`; a failed sign-in redirects
  back with `?error=AccessDenied`, rendered as a message in `LoginContent`
- `src/app/api/auth/[...nextauth]/route.ts` re-exports `handlers.GET` / `handlers.POST`
  from `auth.ts` — the standard Auth.js catch-all route
- `src/app/admin/layout.tsx` calls `await auth()`; `redirect("/login")` server-side if
  there is no session — this is the actual access gate, not client-side logic

### Environment variables (document per `/new-github-action` step 3 conventions —
these are Vercel/local env vars, not GitHub secrets, but follow the same
never-hardcode rule)
```
AUTH_SECRET          random secret for JWT encryption (openssl rand -base64 32)
AUTH_GOOGLE_ID        Google OAuth client ID
AUTH_GOOGLE_SECRET    Google OAuth client secret
ADMIN_EMAIL           the single Google account allowed through
```
All four are already documented in the README "Environment variables" table.

### Design standards (per `/new-page` step 4)
- Cards use `rounded-xl border border-border bg-card p-5` (overview stat cards, panels)
- Status dots: `bg-green-500` / `bg-yellow-500` / `bg-red-500` for ok/warn/fail bank
  status, computed as `hoursAgo < 26 ? "ok" : hoursAgo < 50 ? "warn" : "fail"`
- Icons: Lucide React only (`CheckCircle`, `XCircle`, `Clock`, `MessageSquare`,
  `GitBranch`, `Rocket`, `Database`, `FlaskConical`)
- `AdminSidebar` collapses to a top bar + fixed bottom tab bar on mobile
  (`pb-16` reserved on `<main>` for the fixed bar)

### Component tests (per `/new-page` step 6)
No `*.test.tsx` files currently exist for any `src/app/admin/**` or `src/app/login/**`
component — this is a gap relative to the project's stated testing standard
(`CLAUDE.md` "every new component needs a colocated `*.test.tsx`"). See Notes.

## Acceptance Criteria
- [x] AC1: Unauthenticated visitors to any `/admin/*` route are redirected to `/login`
- [x] AC2: `/login` shows the CardMax stacked logo, "Sign in with Google" button, and
      an "Access denied" message when `?error=AccessDenied` is present
- [x] AC3: Only the account matching `ADMIN_EMAIL` can complete sign-in; all other
      Google accounts are rejected by the `signIn` callback
- [x] AC4: `/admin` shows CI success rate, last deploy time, new/total feedback counts,
      and a 7-bank crawler freshness grid
- [x] AC5: `/admin/ci` shows the last 20 CI runs with per-check pass/fail icons
- [x] AC6: `/admin/crawler` shows a per-bank status table and an `OffersTrendChart`
      line chart of daily scraped offer counts
- [x] AC7: `/admin/feedback` lists all feedback submissions with a "Create GitHub Issue"
      action; converted rows show a link to the created issue and cannot be
      re-converted (409 on double-submit)
- [x] AC8: `AdminSidebar` displays the signed-in user's name/avatar and a sign-out control
- [ ] AC9: Every interactive element and major section in `src/app/admin/**` and
      `src/app/login/**` has a `data-testid` attribute (currently missing — gap)
- [ ] AC10: Every admin/login component has a colocated `*.test.tsx` (currently missing — gap)

## Test Cases

| Test | Type | AC |
|------|------|----|
| unauthenticated request to /admin redirects to /login | e2e | AC1 |
| /login renders logo + Google sign-in button | component | AC2 |
| /login shows AccessDenied message when ?error=AccessDenied | component | AC2 |
| signIn callback rejects non-admin email | unit | AC3 |
| signIn callback accepts ADMIN_EMAIL | unit | AC3 |
| overview page renders CI success rate stat card | component | AC4 |
| overview page renders 7-bank crawler status grid | component | AC4 |
| /admin/ci lists recent runs with status icons | component | AC5 |
| /admin/crawler renders OffersTrendChart with per-bank series | component | AC6 |
| /admin/feedback lists submissions and Create Issue button | component | AC7 |
| Create Issue on already-converted row returns 409 | integration | AC7 |
| AdminSidebar shows user avatar and name | component | AC8 |

## Edge Cases
- GitHub API rate-limited or unreachable → `fetchRecentRuns` / `fetchTestSuiteResults` /
  `fetchLatestDeployment` all catch and return `null`; overview renders "—" / "No CI
  data available." instead of crashing
- No bank has ever been scraped → `fetchBankStatusMap` still renders all 7 banks with
  `status: "fail"` and "never" as the last-scraped label
- `GITHUB_FEEDBACK_TOKEN` unset → GitHub API calls still fire, unauthenticated (lower
  rate limit); `to-issue` conversion will fail — surfaced as a toast/error in
  `FeedbackActions`
- Session cookie present but user later removed from `ADMIN_EMAIL` → existing JWT
  session remains valid until expiry; `signIn` callback only runs at sign-in time, not
  on every request
- `AUTH_SECRET` missing in production → Auth.js throws at startup; must be set in Vercel
  env vars before first deploy

## Notes
- Implementation: no single command covers Auth.js setup — use `/new-page` for route
  scaffolding, layout, and design-token conventions; auth wiring itself follows the
  Auth.js v5 (`next-auth@beta`) App Router pattern directly, as documented above
- This spec was written retroactively — the feature is already implemented and listed
  under "Recently completed" in the README roadmap, but had no spec file. AC9 and AC10
  are marked incomplete to flag the missing `data-testid` and test coverage gap for a
  future cleanup pass; existing behavior otherwise matches AC1–AC8
- `ADMIN_EMAIL` has a hardcoded fallback (`chamisenarath@gmail.com`) in `auth.ts` — the
  env var should always be set explicitly in production to avoid relying on the fallback
