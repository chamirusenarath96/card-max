# Feature: Security CI — npm audit + Trivy Scan (016)

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [ ] Implementation started
- [ ] Tests written
- [ ] Done

## Purpose
Catch known vulnerabilities in npm dependencies and filesystem before they reach
production. A dedicated `security` CI job runs `npm audit` and a Trivy filesystem
scan on every push and pull request, blocking merges on Critical or High severity
findings.

> ⚠️ **Supply chain warning:** `aquasecurity/trivy-action` tags before `v0.35.0`
> were compromised in a supply chain attack in March 2026. Always pin to
> `aquasecurity/trivy-action@v0.35.0` or later **with the `v`-prefix**. Never use
> a short tag like `@master` or `@0.28.0`.

## User Story
As the maintainer, I want the CI pipeline to automatically flag known vulnerabilities
in dependencies so that I can patch them before they are exploited in production.

## Scope

### In Scope
- New CI job `security` in `.github/workflows/ci.yml` (runs in parallel with the existing `ci` job)
- `npm audit --audit-level=high` — fails if any High or Critical vulnerability is found
- Trivy filesystem scan (`trivy fs .`) — scans `package.json` / `package-lock.json` for CVEs
- SARIF output uploaded to GitHub Security → Code Scanning tab
- Job runs on every push to `master`/`main` and every pull request
- `continue-on-error: false` for Critical/High; medium/low are warn-only

### Out of Scope
- Docker image scanning (no Docker image in this project)
- Runtime intrusion detection
- SAST (static application security testing / code pattern analysis)
- Secret scanning (GitHub's built-in secret scanning covers this)
- Dependency auto-update PRs (use Dependabot separately)

## Data Contract
No database changes.

## API Contract
No new API routes.

## Technical Approach

### Vulnerability Severity Policy

| Severity | npm audit | Trivy | Action |
|----------|-----------|-------|--------|
| Critical | ✅ Block CI | ✅ Block CI | Fix before merge |
| High | ✅ Block CI | ✅ Block CI | Fix before merge |
| Medium | ✗ Warn only | ✗ Warn only | Log, create issue |
| Low | ✗ Ignored | ✗ Ignored | Track in backlog |

### Security Job (`.github/workflows/ci.yml`)

Add a new `security` job alongside the existing `ci` job:

```yaml
security:
  name: Security Audit
  runs-on: ubuntu-latest

  permissions:
    security-events: write   # required for SARIF upload
    contents: read

  steps:
    - uses: actions/checkout@v4

    - uses: actions/setup-node@v4
      with:
        node-version: "22"
        cache: "npm"

    - name: Install dependencies
      run: npm ci

    # ── Step 1: npm audit ────────────────────────────────────────────────────
    - name: npm audit (High+Critical)
      run: npm audit --audit-level=high
      # Fails if any High or Critical CVEs are found in the dependency tree

    # ── Step 2: Trivy filesystem scan ────────────────────────────────────────
    - name: Trivy vulnerability scan
      uses: aquasecurity/trivy-action@v0.35.0   # ⚠️ minimum safe version (v0.35.0+)
      with:
        scan-type: "fs"
        scan-ref: "."
        format: "sarif"
        output: "trivy-results.sarif"
        severity: "CRITICAL,HIGH"
        exit-code: "1"          # fail CI on CRITICAL or HIGH findings
        ignore-unfixed: true    # suppress CVEs with no fix yet available

    # ── Step 3: Upload SARIF to GitHub Security tab ──────────────────────────
    - name: Upload Trivy SARIF
      uses: github/codeql-action/upload-sarif@v3
      if: always()              # upload even if Trivy found vulnerabilities
      with:
        sarif_file: "trivy-results.sarif"
        category: "trivy"
```

### Why a Separate Job (Not a Step in `ci`)
- The existing `ci` job runs lint → type-check → test → build sequentially
- Security scans are independent of the build and should not block other jobs from running in parallel
- SARIF upload requires `security-events: write` permission — scoping it to the security job avoids granting this to the entire workflow
- This mirrors GitHub's recommended practice for code scanning

### Trivy Action Version Safety Note
The `aquasecurity/trivy-action` GitHub Action had several tags (including those tagged
before March 2026) compromised in a supply chain attack. Safe practices:
1. Always pin to `@v0.35.0` or a higher semantic version tag (with the `v`-prefix)
2. Never use `@master`, `@latest`, or unpinned short tags
3. Periodically update the pinned version: check https://github.com/aquasecurity/trivy-action/releases

## Acceptance Criteria
- [ ] AC1: `security` job added to `.github/workflows/ci.yml`
- [ ] AC2: `npm audit --audit-level=high` runs and fails CI on High/Critical CVEs
- [ ] AC3: Trivy `fs` scan runs using `aquasecurity/trivy-action@v0.35.0` or later
- [ ] AC4: Trivy results uploaded as SARIF to GitHub Security → Code Scanning tab
- [ ] AC5: CI fails on Critical or High Trivy findings; passes with only Medium/Low
- [ ] AC6: `ignore-unfixed: true` set — CVEs with no available fix do not block CI
- [ ] AC7: Security job runs in parallel with (not after) the existing `ci` job

## Test Cases

| Test | Type | AC |
|------|------|----|
| npm audit passes on clean dependency tree | CI | AC2 |
| Trivy scan passes on repo with no High/Critical CVEs | CI | AC3, AC5 |
| SARIF file uploaded to Security tab | CI | AC4 |
| Workflow YAML valid (actionlint or act) | CI lint | AC1 |

## Edge Cases
- `npm audit` finds a High CVE with no fix → use `npm audit --audit-level=high` and `npm audit fix --force` locally to resolve; or add to `.nsprc` allowlist with justification
- Trivy finds a false positive → add to `.trivyignore` file with CVE ID and reason comment
- SARIF upload fails (e.g. repo has Security tab disabled) → use `if: always()` on upload step so scan still runs; failure is non-blocking
- `npm ci` fails due to lock file mismatch → fix locally with `npm install` and re-commit `package-lock.json`

## Notes
- SARIF upload requires `security-events: write` permission at the job level — already included in the spec
- GitHub Code Scanning is free for public repositories
- After first run: check the Security → Code Scanning tab in the GitHub repo to verify SARIF appears
- Trivy `ignore-unfixed: true` is important — without it, many low-impact unfixable CVEs (in transitive deps) will constantly fail CI
- `.trivyignore` file format: one CVE ID per line (e.g. `CVE-2023-12345`)
- Dependabot can be enabled alongside this to auto-create PRs for dependency updates: `.github/dependabot.yml`
