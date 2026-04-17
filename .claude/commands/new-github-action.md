# Create a New GitHub Action Workflow

Use this skill when asked to add a new GitHub Actions workflow to the card-max
repository. It enforces the project's CI patterns and secret management rules.

---

## Context

- Workflows live in `.github/workflows/<name>.yml`
- Existing workflows: `ci.yml` (lint/test/build/deploy), `crawler.yml` (daily scrape)
- Secrets are managed in GitHub → Settings → Secrets and Variables → Actions
- The project uses Vercel for deployment — Vercel tokens are already in secrets
- Runner: `ubuntu-latest` for all jobs
- Node version: match what's in `package.json` `engines` field (currently **20.x**)

---

## Steps

### 1 — Identify the trigger

| Use case | Trigger |
|---|---|
| Run on every PR | `on: pull_request: branches: [master]` |
| Run on push to master | `on: push: branches: [master]` |
| Scheduled (cron) | `on: schedule: - cron: '0 2 * * *'` |
| Manual run | `on: workflow_dispatch` |
| After another workflow | `on: workflow_run: workflows: ["CI / Deploy"]` |

### 2 — Follow the established workflow structure

Use `ci.yml` as the reference template. Key conventions:

```yaml
name: <Descriptive Name>

on:
  # ... trigger

concurrency:
  group: <workflow-name>-${{ github.ref }}
  cancel-in-progress: true   # prevents stale runs piling up

jobs:
  <job-name>:
    name: <Human Readable Name>
    runs-on: ubuntu-latest
    timeout-minutes: 15       # always set a timeout

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"

      - name: Install dependencies
        run: npm ci             # use ci not install

      # ... your steps
```

### 3 — Secrets and environment variables

Available secrets (already configured in this repo):

| Secret | Purpose |
|---|---|
| `MONGODB_URI` | MongoDB Atlas connection string |
| `VERCEL_TOKEN` | Vercel deployment API token |
| `VERCEL_ORG_ID` | Vercel organisation ID |
| `VERCEL_PROJECT_ID` | Vercel project ID |

Reference secrets as: `${{ secrets.SECRET_NAME }}`

**Never hard-code** credentials, tokens, or connection strings in workflow files.

If the new workflow needs a new secret:
1. Add it to GitHub → Settings → Secrets
2. Document it in the README under "Secrets required"
3. Add it to `.env.example` if it's also needed locally

### 4 — Common step patterns

**Run tests:**
```yaml
- name: Run unit tests
  run: npm run test

- name: Run E2E tests
  run: npx playwright install --with-deps chromium && npm run test:e2e
  env:
    MONGODB_URI: ${{ secrets.MONGODB_URI }}
```

**Build check:**
```yaml
- name: Build
  run: npm run build
  env:
    MONGODB_URI: ${{ secrets.MONGODB_URI }}
```

**Upload test artifacts on failure:**
```yaml
- name: Upload test results
  if: failure()
  uses: actions/upload-artifact@v4
  with:
    name: test-results
    path: test-results/
    retention-days: 7
```

**Cache between jobs:**
```yaml
- uses: actions/cache@v4
  with:
    path: ~/.npm
    key: ${{ runner.os }}-node-${{ hashFiles('**/package-lock.json') }}
    restore-keys: ${{ runner.os }}-node-
```

**Send a notification on failure (Slack/email):**
```yaml
- name: Notify on failure
  if: failure()
  uses: slackapi/slack-github-action@v1
  with:
    payload: '{"text":"Workflow ${{ github.workflow }} failed on ${{ github.ref }}"}'
  env:
    SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

### 5 — Validate the workflow locally

Use [act](https://github.com/nektos/act) to test workflows locally before pushing:
```bash
act pull_request --job <job-name>
```

Or validate YAML syntax:
```bash
npx js-yaml .github/workflows/<name>.yml > /dev/null && echo "valid"
```

### 6 — Common workflow types for this project

#### Security scan
```yaml
name: Security Scan
on:
  push:
    branches: [master]
  schedule:
    - cron: '0 6 * * 1'   # weekly Monday 6am

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
      - run: npm audit --audit-level=high
      - uses: aquasecurity/trivy-action@master
        with:
          scan-type: fs
          severity: HIGH,CRITICAL
```

#### Dependency updates check
```yaml
name: Dependency Check
on:
  schedule:
    - cron: '0 9 * * 1'   # weekly Monday

jobs:
  outdated:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - run: npm outdated || true
```

#### Performance / Lighthouse
```yaml
name: Lighthouse CI
on:
  pull_request:
    branches: [master]

jobs:
  lighthouse:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
      - run: npm ci && npm run build
      - uses: treosh/lighthouse-ci-action@v10
        with:
          urls: |
            http://localhost:3000
          uploadArtifacts: true
```

### 7 — Commit

```bash
git add .github/workflows/<name>.yml
git commit -m "chore(ci): add <workflow description> workflow"
git push origin <branch>
# open PR — the new workflow will run on the PR itself if trigger includes pull_request
```

---

## Reference: Current Workflow Summary

| File | Trigger | Jobs |
|---|---|---|
| `ci.yml` | push/PR to master | lint + type-check + test → build → E2E → deploy preview → promote |
| `crawler.yml` | daily 2am UTC + manual | scrape all banks → upsert to MongoDB → revalidate cache |
