# Feature: CI Test Results Dashboard (025)

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [x] Implementation started
- [ ] Tests written
- [ ] Done

## Purpose
Aggregate and visualise test results from all four CI suites — Vitest unit/component,
Playwright E2E, Lighthouse CI performance, and GitHub Actions workflow status — in a
single GitHub Pages site. Replaces hunting through individual CI job logs to understand
the overall health of the project.

## User Story
As the maintainer, I want a single web page that shows the status of all test suites
and CI workflows so that I can see the health of the project at a glance without
opening GitHub Actions logs.

## Scope

### In Scope
- New GitHub Actions workflow: `.github/workflows/dashboard.yml`
- Publishes to the `gh-pages` branch using `peaceiris/actions-gh-pages`
- Allure Report for Vitest unit/component output (JUnit XML format)
- Allure Report for Playwright E2E output (Allure JSON format)
- LHCI HTML report embedded from the most recent Lighthouse CI artefact
- GitHub Actions badge summary (workflow status badges from `shields.io` or native GitHub badges)
- A top-level `index.html` linking all panels together
- No custom backend — all data comes from CI artefacts and GitHub badge URLs
- Dashboard URL: `https://chamirusenarath96.github.io/card-max/`

### Out of Scope
- Real-time streaming CI status (badge summary is near-real-time via GitHub API)
- Historical trend graphs (Allure handles run-over-run history natively)
- Authentication or access control (GitHub Pages is public)
- Custom metrics beyond what Allure and LHCI already produce
- Cron job summary panel — covered separately in spec 028

## Data Contract
No schema or database changes. All data comes from:
- CI artefact outputs (`JUnit XML`, `Allure JSON`, `LHCI HTML`)
- GitHub Actions API badge format (SVG badges, no API key required)

## API Contract
No new API endpoints. The dashboard is a static GitHub Pages site.

## Technical Approach

Follow steps 1–7 of `/new-github-action` for the dashboard workflow.

### Workflow trigger (from `/new-github-action` step 1)
```yaml
on:
  push:
    branches: [master]
  workflow_run:
    workflows: ["CI / Deploy"]
    types: [completed]
```

### Workflow file: `.github/workflows/dashboard.yml`

```yaml
name: CI Dashboard

on:
  push:
    branches: [master]
  workflow_run:
    workflows: ["CI / Deploy"]
    types: [completed]

concurrency:
  group: dashboard-${{ github.ref }}
  cancel-in-progress: true

jobs:
  build-dashboard:
    name: Build & Publish Dashboard
    runs-on: ubuntu-latest
    timeout-minutes: 15

    permissions:
      contents: write   # required for gh-pages push

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      # ── Step 1: Vitest with JUnit + Allure output ─────────────────────────
      - name: Run unit tests with Allure reporter
        run: npm run test -- --reporter=allure-vitest/reporter --reporter=default
        env:
          ALLURE_RESULTS_DIR: allure-results/unit

      # ── Step 2: Playwright E2E with Allure reporter ───────────────────────
      - name: Build for E2E
        run: npm run build
        env:
          MONGODB_URI: ${{ secrets.MONGODB_URI }}

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium

      - name: Run E2E tests with Allure reporter
        run: npx playwright test --reporter=allure-playwright
        env:
          MONGODB_URI: ${{ secrets.MONGODB_URI }}
          ALLURE_RESULTS_DIR: allure-results/e2e

      # ── Step 3: Generate Allure HTML reports ──────────────────────────────
      - name: Generate Allure unit report
        run: |
          npm install -g allure-commandline
          allure generate allure-results/unit --output dashboard/allure-unit --clean

      - name: Generate Allure E2E report
        run: allure generate allure-results/e2e --output dashboard/allure-e2e --clean

      # ── Step 4: Download latest LHCI artefact ─────────────────────────────
      - name: Download Lighthouse report artefact
        uses: dawidd6/action-download-artifact@v6
        with:
          workflow: ci.yml
          name: lighthouse-report-*
          path: dashboard/lighthouse
          search_artifacts: true
          if_no_artifact_found: warn
        continue-on-error: true

      # ── Step 5: Generate index.html ───────────────────────────────────────
      - name: Generate dashboard index
        run: node scripts/build-dashboard-index.js

      # ── Step 6: Publish to gh-pages ───────────────────────────────────────
      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dashboard
          keep_files: false
```

### Dashboard index generator (`scripts/build-dashboard-index.js`)

A plain Node.js script (no TypeScript required — it runs post-build) that writes
`dashboard/index.html` with:
- Links to `./allure-unit/index.html` and `./allure-e2e/index.html`
- An embedded iframe or link to `./lighthouse/` LHCI report
- GitHub Actions status badges (SVG badges from `https://github.com/<owner>/<repo>/actions/workflows/<file>/badge.svg`)
- A generated timestamp

### Required npm packages
```bash
npm install -D allure-vitest allure-playwright
npm install -g allure-commandline   # installed in CI only
```

### Secrets and environment variables (from `/new-github-action` step 3)
No new secrets required. `GITHUB_TOKEN` is auto-injected by GitHub Actions and has
`contents: write` permission for the `gh-pages` push. `MONGODB_URI` is the existing
Production environment secret needed for E2E.

### Enable GitHub Pages
In the repo settings: `Settings → Pages → Source → Deploy from a branch → gh-pages / root`.
Set once by the maintainer; subsequent pushes from the workflow update the site automatically.

## Acceptance Criteria
- [ ] AC1: `.github/workflows/dashboard.yml` created; triggers on push to master and on CI / Deploy workflow completion
- [ ] AC2: Allure unit test report generated from Vitest JUnit/Allure output and published under `dashboard/allure-unit/`
- [ ] AC3: Allure E2E report generated from Playwright Allure output and published under `dashboard/allure-e2e/`
- [ ] AC4: Latest Lighthouse CI HTML report included under `dashboard/lighthouse/`
- [ ] AC5: Top-level `dashboard/index.html` links to all three reports and shows GitHub Actions status badges
- [ ] AC6: GitHub Pages site live at `https://chamirusenarath96.github.io/card-max/` after first successful run
- [ ] AC7: `allure-vitest` and `allure-playwright` packages installed as devDependencies
- [ ] AC8: Dashboard build does not block or depend on the production deploy job

## Test Cases

| Test | Type | AC |
|------|------|----|
| Workflow YAML is valid | CI lint | AC1 |
| Allure unit report directory exists after run | CI | AC2 |
| Allure E2E report directory exists after run | CI | AC3 |
| index.html contains links to allure-unit and allure-e2e | unit | AC5 |
| index.html contains a GitHub Actions badge `<img>` | unit | AC5 |
| gh-pages branch updated on push to master | CI | AC6 |

## Edge Cases
- Lighthouse artefact not found (spec 018 not yet implemented) — `continue-on-error: true` on download step; index.html renders a "not available" placeholder for the LHCI panel
- E2E tests fail in the dashboard job — upload partial Allure output with `if: always()` so the failure is still visible in the report
- Allure `keep_files: false` overwrites previous report — acceptable; Allure's own history directory handles cross-run trends if configured
- `peaceiris/actions-gh-pages` requires `contents: write` — scoped to the `build-dashboard` job only

## Notes
- Implementation: use the `/new-github-action` command for the workflow; refer to steps 1–7 for structure, secrets, and commit conventions
- Allure docs: https://allurereport.org/docs/vitest/ and https://allurereport.org/docs/playwright/
- `dawidd6/action-download-artifact` is the standard solution for downloading artefacts from other workflow runs on GitHub Actions
- The `peaceiris/actions-gh-pages@v4` action is the community standard for GitHub Pages deployment from Actions; pin to `v4` (not `@master`)
- Spec 028 extends this dashboard with a cron job summary panel — implement 025 first
