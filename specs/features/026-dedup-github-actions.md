# Feature: Remove Duplicate GitHub Actions Workflows (026)

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [x] Implementation started
- [ ] Tests written
- [ ] Done

## Purpose
Reduce CI maintenance surface and GitHub Actions minutes by auditing all workflow
files for redundant jobs and steps — specifically the Atlas warmup logic that fires
both in `atlas-warmup.yml` (cron) and redundantly inside the deploy job — and
consolidating shared setup steps (repeated `npm ci`, Node.js setup) into reusable
composite actions or `workflow_call` workflows.

## User Story
As the maintainer, I want each CI operation to be defined and executed exactly once
so that updating a step (e.g. Node version, npm install flags) only requires a change
in one place and does not accidentally drift between workflow files.

## Scope

### In Scope
- Audit all files in `.github/workflows/` for duplicate warmup logic, repeated `npm ci`
  and `setup-node` steps across jobs, and redundant steps
- Remove the Atlas warmup curl call from the deploy job (`ci.yml` Job 4) — the
  standalone `atlas-warmup.yml` already covers this
- Extract repeated checkout + Node setup + `npm ci` into a **composite action** at
  `.github/actions/setup/action.yml` and reference it from all jobs
- Validate that the consolidated workflows produce identical CI behaviour
- Update README under "CI / Continuous Integration" to reflect the new structure

### Out of Scope
- Changing what the workflows do — only how they are structured
- Migrating to a third-party CI system (GitHub Actions is the chosen platform)
- Creating a self-hosted runner
- Changes to the `.claude/` scheduled tasks (they are not GitHub Actions workflows)

## Data Contract
No database changes.

## API Contract
No new API endpoints.

## Technical Approach

Follow steps 1–7 of `/new-github-action` for all workflow modifications.

### Step 1 — Audit (from `/new-github-action` step 1)

Read all files in `.github/workflows/` and identify:

| Duplication type | Where | Fix |
|-----------------|-------|-----|
| Atlas warmup curl | `ci.yml` Job 4 post-deploy step **and** `atlas-warmup.yml` | Remove from `ci.yml`; keep `atlas-warmup.yml` |
| `actions/checkout@v4` | Every job in every workflow | Extract to composite action |
| `actions/setup-node@v4` + `npm ci` | Every job in every workflow | Extract to composite action |
| Playwright `install --with-deps chromium` | `ci.yml` e2e job + `dashboard.yml` | Extract to composite action or reuse step |

### Step 2 — Composite action (from `/new-github-action` step 2 conventions)

Create `.github/actions/setup/action.yml`:

```yaml
name: Setup Node & Install
description: Checkout, set up Node 20, and install npm dependencies

runs:
  using: composite
  steps:
    - uses: actions/checkout@v4

    - uses: actions/setup-node@v4
      with:
        node-version: "20"
        cache: "npm"

    - name: Install dependencies
      run: npm ci
      shell: bash
```

Reference in each job:
```yaml
steps:
  - uses: ./.github/actions/setup
  # ... job-specific steps
```

### Step 3 — Remove warmup duplication

In `ci.yml` Job 4 (Deploy), locate and remove any step that calls
`curl .../api/health` or `curl .../api/revalidate` for warmup purposes. The ISR
cache bust (`POST /api/revalidate`) is **not** a warmup step and must be kept;
only the redundant Atlas health ping is removed.

### Step 4 — Validate equivalence

After consolidation, verify:
```bash
# Workflow YAML must remain syntactically valid
npx js-yaml .github/workflows/ci.yml > /dev/null && echo "valid"
npx js-yaml .github/workflows/atlas-warmup.yml > /dev/null && echo "valid"
npx js-yaml .github/workflows/dashboard.yml > /dev/null && echo "valid"
# (and any other workflow files)
```

Run `act pull_request --job ci` locally (optional) to confirm the consolidated
`ci` job still passes.

### Step 5 — Update documentation

Update `README.md` under "CI / Continuous Integration → Current Workflow Summary" table
(referenced in `/new-github-action`) to reflect the composite action and removed duplicates.

### Commit convention (from `/new-github-action` step 7)
```bash
git checkout -b chore/dedup-github-actions
git add .github/workflows/ .github/actions/
git commit -m "chore(ci): consolidate duplicate workflow steps into composite action"
git push origin chore/dedup-github-actions
```

## Acceptance Criteria
- [ ] AC1: `.github/actions/setup/action.yml` composite action created with checkout, Node 20 setup, and `npm ci`
- [ ] AC2: All jobs in `ci.yml` reference `./.github/actions/setup` instead of inline checkout + setup + install steps
- [ ] AC3: Atlas warmup curl call removed from `ci.yml` (the `atlas-warmup.yml` cron covers this)
- [ ] AC4: All workflow YAML files pass syntax validation (`js-yaml` or `actionlint`)
- [ ] AC5: CI pipeline produces the same job results before and after consolidation (all jobs pass)
- [ ] AC6: README workflow summary table updated to reflect new composite action

## Test Cases

| Test | Type | AC |
|------|------|----|
| `.github/actions/setup/action.yml` is valid YAML | CI lint | AC1 |
| `ci.yml` jobs reference `./.github/actions/setup` | unit | AC2 |
| No Atlas warmup `curl` step present in `ci.yml` Job 4 | unit | AC3 |
| All workflow files pass `js-yaml` validation | CI lint | AC4 |
| CI / Deploy workflow completes successfully after refactor | CI | AC5 |

## Edge Cases
- Composite action uses `shell: bash` on `ubuntu-latest` — explicitly set on all `run` steps inside `runs.steps` because composite actions do not inherit a default shell
- Some jobs need environment-specific secrets (e.g. `MONGODB_URI` for E2E) — the composite action handles only the non-secret setup; secrets are still declared per-job via `env:`
- `actions/checkout@v4` inside a composite action fetches the calling workflow's ref by default — no special ref override needed
- Removing the warmup from Job 4 means there is a short window post-deploy before the atlas-warmup cron fires — acceptable given the cron runs every 4 minutes (spec 012)

## Notes
- Implementation: use the `/new-github-action` command for structural guidance; reference steps 2 (structure conventions) and 7 (commit) directly
- GitHub composite action docs: https://docs.github.com/en/actions/creating-actions/creating-a-composite-action
- `actionlint` is a stricter linter than `js-yaml` and catches logic errors (e.g. missing `shell:` on composite steps) — consider adding it as a CI check
- Do not extract secrets or environment-specific `env:` blocks into the composite action — keep them at the job level for clarity and security
- The ISR cache bust step (`POST /api/revalidate`) in Job 4 is NOT a duplicate of anything — keep it; only the redundant Atlas health ping is removed
