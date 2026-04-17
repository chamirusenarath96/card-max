# Feature: MongoDB Atlas Connection Warmup Cron (012)

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [ ] Implementation started
- [ ] Tests written
- [ ] Done

## Purpose
MongoDB Atlas M0 (free tier) closes idle connections after ~5 minutes of inactivity.
The first API request after a cold period pays a 1–3 second connection overhead. A
lightweight warmup cron keeps the connection alive and eliminates cold-start latency
for real users.

## User Story
As a user browsing the site after it has been idle, I want the page to load quickly
without a noticeable delay so that the experience feels snappy and responsive.

## Scope

### In Scope
- New GitHub Actions workflow: `.github/workflows/atlas-warmup.yml`
- Runs on a schedule: every 4 minutes (just under the ~5 min idle timeout)
- Calls `GET /api/health` on the production URL — this is enough to keep the connection alive
- No new code in the application itself (health endpoint already exists)

### Out of Scope
- Connection pooling changes in `src/lib/db/connect.ts`
- Upgrading from M0 to a paid Atlas tier (which has no idle timeout)
- Warming up staging/preview environments

## Data Contract
Uses existing `GET /api/health` endpoint which returns `{ status: "ok", db: "connected" }`.

## API Contract
```
GET https://card-max.vercel.app/api/health
Response 200: { "status": "ok", "db": "connected" }
```

## Technical Approach

### Workflow (`.github/workflows/atlas-warmup.yml`)
```yaml
name: Atlas Warmup
on:
  schedule:
    - cron: '*/4 * * * *'   # every 4 minutes

jobs:
  warmup:
    runs-on: ubuntu-latest
    steps:
      - name: Ping health endpoint
        run: |
          STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
            "${{ vars.VERCEL_APP_URL }}/api/health")
          if [ "$STATUS" != "200" ]; then
            echo "Health check failed with status $STATUS"
            exit 1
          fi
          echo "Atlas connection warm — status $STATUS"
```

### Why GitHub Actions cron?
- Free for public repos, no infrastructure needed
- GitHub Actions cron has ~1 min scheduling accuracy (acceptable for a 4-min interval)
- No secrets needed if `VERCEL_APP_URL` is a public variable
- Alternative: Vercel Cron Jobs (requires Pro plan) — not viable on free tier

### Failure handling
- If the health endpoint returns non-200, the step fails but does not create a GitHub Issue
  (transient failures are expected and harmless for a warmup job)
- Add `continue-on-error: true` to prevent noisy failure notifications

## Acceptance Criteria
- [ ] AC1: Workflow file created at `.github/workflows/atlas-warmup.yml`
- [ ] AC2: Cron fires every 4 minutes (`*/4 * * * *`)
- [ ] AC3: Calls `GET /api/health` using the production URL
- [ ] AC4: Exits 0 on 200 response, exits non-zero on any other status
- [ ] AC5: First API request after 4+ minutes of inactivity responds in < 500ms (P95)
- [ ] AC6: Workflow does not require secrets (uses public `vars.VERCEL_APP_URL`)

## Test Cases

| Test | Type | AC |
|------|------|----|
| Health endpoint returns 200 with db status | e2e | AC3 |
| Workflow YAML is valid (act or workflow validator) | CI lint | AC1 |

## Edge Cases
- GitHub Actions free tier limits: 2000 min/month. At 4-min intervals: 24×60/4 = 360 calls/day × 0.5 min each ≈ 180 min/day. Well within free tier.
- Vercel serverless cold-starts: the warmup call also keeps the Vercel function warm as a side effect
- If the production URL changes, update `vars.VERCEL_APP_URL` in GitHub repo variables

## Notes
- `vars.VERCEL_APP_URL` (not `secrets`) is appropriate since the production URL is public
- GitHub Actions cron does not run if the repo has been inactive for 60 days — acceptable for a production site with regular commits
- Alternative approach: use UptimeRobot (free) to ping `/api/health` every 5 minutes — same effect, no GitHub Actions minutes used
- For the M0 free tier the biggest win is eliminating the Mongoose `connect()` time (~1-2s). Once the connection is pooled and warm, subsequent API calls skip this entirely.
