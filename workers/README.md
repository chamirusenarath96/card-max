# card-max scraper Worker (PoC)

Standalone Cloudflare Worker for spec [072](../specs/features/072-cloudflare-workers-scraping.md).
Deployed and versioned independently of the Next.js app and the crawler — it
is **not** part of the root `tsconfig.json`/`eslint.config.mjs` scope (different
runtime globals than Node/DOM), and is not built or tested by `npm run build`
or `npm run test`.

## What this is

A PoC "fetch relay": the GH Actions crawler calls `POST /` on this Worker
instead of fetching bank pages directly, so requests originate from
Cloudflare's edge (rotating colo/IP) rather than the GH Actions runner's
single, increasingly-blocklisted IP. See spec 072 for the architecture
decision (model A: GH orchestrates) and cost analysis.

## Deploy (manual — requires a Cloudflare account)

```bash
cd workers
npx wrangler login          # one-time OAuth
npx wrangler secret put WORKER_SECRET   # paste a random secret
npx wrangler deploy
```

Then set the deployed URL and secret as GitHub Actions secrets:
`WORKER_SCRAPE_URL` (e.g. `https://card-max-scraper-poc.<account>.workers.dev`)
and `WORKER_SECRET` (same value as above).

## Verify

```bash
WORKER_SCRAPE_URL=https://... WORKER_SECRET=... npx tsx scripts/verify-workers.ts --bank all
```

or via GitHub Actions: `gh workflow run workers-verify.yml -f bank=all`
(requires the `WORKER_SCRAPE_URL`/`WORKER_SECRET` repo secrets above to be set first).

## Status

Live verification against the 3 blocked URLs (AC1) and the Browser
Rendering vs. plain-fetch comparison for Sampath (AC2) require an actual
Cloudflare account + deployment and were **not** run as part of this PR —
see spec 072's Findings section for what's left for a human to verify.
