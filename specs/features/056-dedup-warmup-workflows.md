# Feature: Consolidate Duplicate Warmup Workflow & Extend Composite Setup Action (056)

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [ ] Implementation started
- [ ] Tests written
- [ ] Done

## Purpose
Spec 026 deduplicated `ci.yml`'s setup steps into `.github/actions/setup/action.yml`,
but two problems have since re-emerged in `.github/workflows/`: (1) `atlas-warmup.yml`
(spec 012, canonical) and `warmup.yml` are two separate cron workflows that both exist
solely to keep the MongoDB Atlas M0 connection warm, pinging different endpoints
(`/api/health` vs `/api/ping`) on overlapping schedules; (2) `crawler.yml`, `enrich.yml`,
and `scraper-smoke.yml` were never migrated to the composite setup action created by
spec 026 and still each inline their own `actions/checkout` + `actions/setup-node` +
`npm ci` steps (`scraper-smoke.yml` even drifted to Node 20 while everything else is on
Node 22). This is the README roadmap item re-opened at "Remove duplicate GitHub Actions
workflows".

## User Story
As the maintainer, I want exactly one warmup workflow and one place that defines
"checkout + install Node deps" so that CI minutes aren't wasted on redundant cron pings
and a Node version bump doesn't require touching four separate files.

## Scope

### In Scope
- Remove `.github/workflows/warmup.yml` (the redundant "Atlas Connection Warmup" cron)
  — `atlas-warmup.yml` (spec 012) already keeps the connection warm
- Remove `src/app/api/ping/route.ts` + its colocated test — the endpoint has no
  remaining caller once `warmup.yml` is removed (`/api/health` is canonical, used by
  `atlas-warmup.yml`, monitoring, and the E2E suite)
- Migrate `crawler.yml`, `enrich.yml`, and `scraper-smoke.yml` to use
  `./.github/actions/setup` instead of inline `actions/checkout` + `actions/setup-node`
  + `npm ci` steps (bringing them in line with `ci.yml`, which already does this per
  spec 026)
- As a consequence of the migration, `scraper-smoke.yml` moves from Node 20 to Node 22
  (the version pinned in the composite action) — no separate version bump needed
- Update the README "GitHub Actions Workflows" table and workflow count to drop the
  `warmup.yml` row and reflect the composite action's expanded usage
- Check off the corresponding roadmap item in README

### Out of Scope
- Changing `atlas-warmup.yml`'s schedule or endpoint (spec 012 behaviour unchanged)
- Any change to what `ci.yml` does (already fully migrated by spec 026)
- Introducing `workflow_call` reusable workflows (composite action is sufficient for
  the current duplication; revisit only if a future workflow needs job-level reuse,
  not just step-level)
- Rate limiting or middleware changes (`/api/ping` was never in the rate-limit matcher)

## Data Contract
No database changes.

## API Contract
`GET /api/ping` is removed. No replacement — callers (only `warmup.yml`) are removed
in the same change. `GET /api/health` (spec 012) is unaffected.

## Technical Approach

1. Delete `.github/workflows/warmup.yml`.
2. Delete `src/app/api/ping/route.ts` and `src/app/api/ping/route.test.ts`.
3. In `crawler.yml` and `enrich.yml`, replace:
   ```yaml
   - uses: actions/checkout@v4
   - uses: actions/setup-node@v4
     with:
       node-version: "22"
       cache: "npm"
   - name: Install dependencies
     run: npm ci
   ```
   with:
   ```yaml
   - uses: actions/checkout@v4
   - uses: ./.github/actions/setup
   ```
   (checkout stays inline — composite actions cannot check out the repo that contains
   them, per the existing note in `.github/actions/setup/action.yml`)
4. In `scraper-smoke.yml`, replace the equivalent Node-20 inline steps the same way.
5. Update `src/lib/ci/workflow.test.ts`-style coverage: extend it (or add assertions)
   so `crawler.yml`, `enrich.yml`, and `scraper-smoke.yml` are also checked for
   `uses: ./.github/actions/setup` and the absence of inline `actions/setup-node`.
6. Update README: remove the `warmup.yml` row from the workflow table, update the
   "Uses composite action" column for `crawler.yml`, `enrich.yml`, and
   `scraper-smoke.yml` from ❌ to ✅, and check off the roadmap line item.
7. Validate all workflow YAML remains syntactically valid.

## Acceptance Criteria
- [ ] AC1: `.github/workflows/warmup.yml` no longer exists
- [ ] AC2: `src/app/api/ping/route.ts` and its test no longer exist
- [ ] AC3: `crawler.yml`, `enrich.yml`, and `scraper-smoke.yml` each reference
      `uses: ./.github/actions/setup` and contain no inline `actions/setup-node@v4` step
- [ ] AC4: `atlas-warmup.yml` is unchanged and remains the sole warmup cron
- [ ] AC5: All workflow YAML files pass syntax validation
- [ ] AC6: README workflow table and roadmap checkbox reflect the new state

## Test Cases

| Test | Type | AC |
|------|------|----|
| `warmup.yml` file does not exist | unit (fs check in `workflow.test.ts`) | AC1 |
| `/api/ping` route file does not exist | unit (fs check) | AC2 |
| `crawler.yml` references composite setup action, no inline `setup-node` | unit | AC3 |
| `enrich.yml` references composite setup action, no inline `setup-node` | unit | AC3 |
| `scraper-smoke.yml` references composite setup action, no inline `setup-node` | unit | AC3 |
| `atlas-warmup.yml` still contains the `*/4 * * * *` cron and `/api/health` curl | unit | AC4 |
| All workflow files pass `js-yaml` validation | CI lint | AC5 |

## Edge Cases
- `scraper-smoke.yml` is manual-dispatch-only (no schedule), so moving it to Node 22
  carries no cron-timing risk — it only runs when a maintainer triggers it
- The composite action does not include `actions/checkout` (must precede it in the
  calling job) — `crawler.yml`, `enrich.yml`, and `scraper-smoke.yml` keep their own
  `actions/checkout@v4` step and only replace the setup-node + npm ci portion
- Removing `/api/ping` means any external uptime monitor pointed at that path (outside
  this repo, e.g. UptimeRobot) would start failing — not tracked in this repo, so out
  of scope, but worth a mental note since spec 012's Notes section mentions UptimeRobot
  as an alternative approach that was never actually adopted

## Documentation Impact
- `README.md` → "GitHub Actions Workflows" table: remove the `warmup.yml` row, flip
  the "Uses composite action" column to ✅ for `crawler.yml`, `enrich.yml`,
  `scraper-smoke.yml`
- `README.md` → roadmap: check off "Remove duplicate GitHub Actions workflows"

## Notes
- This re-opens and completes the scope spec 026 originally intended (its own Edge
  Cases section already anticipated further consolidation) but only migrated `ci.yml`
  at the time
- `atlas-warmup.yml` (not `warmup.yml`) was kept as canonical because it is the one
  spec 012 actually defines and the one `specs/features/028-cron-job-summary.md`'s
  dashboard already keys off (`id: "atlas-warmup.yml"`)
