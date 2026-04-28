# Feature: Mobile Performance & SLA Enforcement (018)

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [ ] Implementation started
- [ ] Tests written
- [ ] Done

## Purpose
The desktop experience is acceptable but mobile cold-load is noticeably slow.
This feature: (1) diagnoses and fixes the mobile bottleneck, (2) defines measurable
SLAs, and (3) gates production deploys on Lighthouse CI so regressions can never ship.

## User Story
As the site owner, I want a Lighthouse CI check to run against every preview deployment
so that any code change that degrades mobile load time is blocked before it reaches
production, and users always get a fast first load on mobile.

## Scope

### In Scope
- **Performance investigation** — identify the primary mobile bottleneck(s):
  large JS bundle, unoptimised images, missing font preload, or waterfall blocking render
- **SLA definition**:
  - Initial page load: LCP ≤ 2.5 s on mobile (Moto G4 @ 3G in Lighthouse)
  - Search/filter response: ≤ 500 ms after user input (measured as time-to-new-grid-paint)
- **Lighthouse CI step** in `.github/workflows/ci.yml` — inserted after Step 3
  (`vercel deploy --prebuilt` → preview URL) and before Step 4 (`vercel promote`);
  fails the deploy job if LCP > 2.5 s or Performance score < 70
- **Lighthouse HTML report** uploaded as a CI artefact on every run (pass and fail)
- Any quick-win fixes uncovered by the investigation (image optimisation, font preload,
  bundle splitting) implemented in the same branch

### Out of Scope
- Server-side rendering changes beyond what the investigation recommends
- Edge caching strategy changes (covered by existing ISR setup)
- Synthetic monitoring / alerting in production (out of band from CI)
- Paid Lighthouse CI SaaS — use the open-source `@lhci/cli` (free)

## Data Contract
No schema or data model changes.

## API Contract
No new API endpoints. The Lighthouse CI step calls the Vercel preview URL directly.

## Technical Approach

Follow steps 1–7 of `/new-github-action` for the Lighthouse CI workflow addition.

### Workflow file location (from `/new-github-action` conventions)
```
.github/workflows/ci.yml   — add lhci step inside the existing deploy job
.lighthouserc.json          — Lighthouse CI configuration at repo root
```

### Lighthouse CI step placement (follows `/new-github-action` step 2 structure)
Insert inside the existing **Job 4 — Deploy to Production** in `ci.yml`, between
`vercel deploy --prebuilt` (which produces the preview URL) and `vercel promote`:

```yaml
- name: Run Lighthouse CI
  run: |
    npm install -g @lhci/cli
    lhci autorun
  env:
    LHCI_BUILD_CONTEXT__CURRENT_HASH: ${{ github.sha }}
    LHCI_TOKEN: ${{ secrets.LHCI_TOKEN }}   # optional; omit if not using LHCI server
    TARGET_URL: ${{ steps.deploy.outputs.preview_url }}

- name: Upload Lighthouse report
  if: always()
  uses: actions/upload-artifact@v4
  with:
    name: lighthouse-report-${{ github.sha }}
    path: .lighthouseci/
    retention-days: 14
```

Capture the preview URL in the `vercel deploy` step using `id: deploy` and
`echo "preview_url=$(vercel deploy ...)" >> $GITHUB_OUTPUT`.

### Lighthouse CI configuration (`.lighthouserc.json`)
```json
{
  "ci": {
    "collect": {
      "url": ["${TARGET_URL}"],
      "numberOfRuns": 3,
      "settings": {
        "preset": "perf",
        "throttlingMethod": "simulate",
        "emulatedFormFactor": "mobile",
        "throttling": {
          "rttMs": 150,
          "throughputKbps": 1638.4,
          "cpuSlowdownMultiplier": 4
        }
      }
    },
    "assert": {
      "assertions": {
        "categories:performance": ["error", { "minScore": 0.70 }],
        "largest-contentful-paint": ["error", { "maxNumericValue": 2500 }],
        "total-blocking-time": ["warn", { "maxNumericValue": 600 }],
        "cumulative-layout-shift": ["warn", { "maxNumericValue": 0.1 }]
      }
    },
    "upload": {
      "target": "filesystem",
      "outputDir": ".lighthouseci"
    }
  }
}
```

### Runner setup (from `/new-github-action` step 2 conventions)
```yaml
- uses: actions/checkout@v4
- uses: actions/setup-node@v4
  with:
    node-version: "20"
    cache: "npm"
```

### Secrets (from `/new-github-action` step 3)
No new secrets are required for the filesystem upload target. If a Lighthouse CI server
is added later, document `LHCI_TOKEN` in the README under "Secrets required".

### Performance fix candidates (investigation-driven)
The following are likely fixes based on the known stack; confirm each with a Lighthouse
audit before implementing:

| Candidate | Likely cause | Fix |
|-----------|-------------|-----|
| Large JS bundle | No route-level code splitting | Use `next/dynamic` for heavy client components |
| Unoptimised images | Raw `<img>` tags | Replace with `next/image` + `sizes` prop |
| Font FOUT / blocking | No `<link rel="preload">` for fonts | Add `font-display: swap` + preload in `layout.tsx` |
| Render-blocking 3rd party | Inline scripts or synchronous CSS | Move to `next/script` with `strategy="lazyOnload"` |

## Acceptance Criteria
- [ ] AC1: `.lighthouserc.json` exists at repo root with mobile simulation, LCP ≤ 2500 ms
         assertion, and Performance score ≥ 70 assertion
- [ ] AC2: A Lighthouse CI step runs in Job 4 of `ci.yml` after `vercel deploy --prebuilt`
         and before `vercel promote`
- [ ] AC3: The deploy job fails if LCP > 2.5 s or Performance score < 70
- [ ] AC4: The Lighthouse HTML report is uploaded as a CI artefact (pass and fail)
         with a 14-day retention window
- [ ] AC5: At least one measured performance fix is implemented (bundle, images, fonts,
         or render-blocking) such that the Lighthouse CI step passes on the first run
- [ ] AC6: The search/filter response time is ≤ 500 ms on desktop (measured via
         Lighthouse "Interactive" metric or manual Playwright timing assertion)

## Test Cases

| Test | Type | AC |
|------|------|----|
| .lighthouserc.json exists and is valid JSON | unit | AC1 |
| Lighthouse step present in ci.yml after deploy step | unit | AC2 |
| LCP assertion set to maxNumericValue: 2500 | unit | AC1, AC3 |
| Performance score assertion set to minScore: 0.70 | unit | AC1, AC3 |
| Upload artifact step uses `if: always()` | unit | AC4 |
| Lighthouse passes against the preview URL | e2e | AC3, AC5 |

## Edge Cases
- Preview URL is protected by Vercel deployment auth — the Lighthouse step runs as
  part of the deploy job which has the `VERCEL_TOKEN`; the preview URL must be
  publicly accessible or the lhci step must pass the token as a header
- Flaky LCP (network jitter in CI) — use `numberOfRuns: 3` and median aggregation
  (lhci default) to reduce variance
- First-run cold start on Vercel serverless — MongoDB cold connect can inflate LCP;
  the Atlas warmup cron (spec 012) mitigates this; note in failing runs
- `TARGET_URL` env var not set — `lhci autorun` will error; guard with a step that
  validates the URL exists before invoking lhci
- Lighthouse CI binary not cached — `npm install -g @lhci/cli` on each run; cache
  `~/.npm` via `actions/cache@v4` to reduce install time (see `/new-github-action` step 4)

## Notes
- Implementation: use the `/new-github-action` command for the CI step; use the
  `/new-page` command for any component-level performance fixes
- Lighthouse CI docs: https://github.com/GoogleChrome/lighthouse-ci
- `lhci autorun` reads `.lighthouserc.json` from the repo root automatically — no
  additional CLI flags needed
- Do not use `--preset=desktop` — the SLA is defined for mobile; desktop is already
  acceptable
- The 14-day artefact retention matches the existing `test-results` upload in `ci.yml`
- If the Lighthouse step is too slow (> 5 min), restrict `numberOfRuns` to 2 and add
  `timeout-minutes: 10` to the job per `/new-github-action` step 2 conventions
