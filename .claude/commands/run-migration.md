# Run a DB Migration

Use this skill whenever you need to write and execute a one-off MongoDB migration for card-max.

---

## When to use

- A field type or enum value has changed and existing documents need updating
- A scraper bug was fixed and legacy records need to be re-classified (e.g. offerType, discountPercentage)
- A new required field is being backfilled across existing documents
- Index changes that require data reshaping before Mongoose picks them up

---

## Steps

### 1. Write the migration script

Create `scripts/migrate-<short-description>.ts` following this template:

```ts
/**
 * Migration: <what this does and why>
 *
 * Safe to re-run — only touches documents that still match the stale pattern.
 *
 * Usage: npm run migrate:<short-description>
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { connectDb, disconnectDb } from "../crawler/utils/db";
import { OfferModel } from "../src/lib/models/offer.model";

async function main(): Promise<void> {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) { console.error("MONGODB_URI is required"); process.exit(1); }

  await connectDb(mongoUri);

  // 1. Dry-run count
  const filter = { /* stale pattern */ };
  const total = await OfferModel.countDocuments(filter);
  if (total === 0) {
    console.log("[migrate] Nothing to do.");
    await disconnectDb();
    return;
  }
  console.log(`[migrate] ${total} record(s) to update`);

  // 2. Sample a few for review
  const samples = await OfferModel.find(filter).limit(5).select("bank merchant title").lean();
  samples.forEach((s, i) => console.log(`  ${i + 1}. [${s.bank}] ${s.merchant} — "${s.title}"`));

  // 3. Apply the update
  const result = await OfferModel.updateMany(filter, { $set: { /* new values */ } });
  console.log(`[migrate] ✅ Updated ${result.modifiedCount} / ${total} record(s)`);

  await disconnectDb();
}

main().catch(err => { console.error(err); process.exit(1); });
```

**Rules:**
- Always print a count and samples before writing — gives a visual sanity check
- Always use a specific `filter` so the update is targeted, never a blanket `{}`
- Make the script idempotent — documents already migrated must not match the filter again
- Use `OfferModel.updateMany` (not raw MongoDB) to stay within the Mongoose abstraction

### 2. Register the npm script

In `package.json`, add under `"scripts"`:

```json
"migrate:<short-description>": "tsx scripts/migrate-<short-description>.ts"
```

The generic `"migrate"` key is reserved for the most recent one-off. New migrations get their own named key so the history is preserved.

### 3. Type-check before running

```bash
npm run type-check
```

Fix any errors before proceeding.

### 4. Run against the database

```bash
npm run migrate:<short-description>
```

Read the console output carefully:
- Confirm the **count** looks reasonable (not unexpectedly 0 or 10 000+)
- Confirm the **sample records** are the ones you expected to touch
- Confirm the final **Updated N / N** line matches

### 5. Verify in the app

Spot-check a few cards / API responses to confirm the data looks correct after the migration.

### 6. Commit

```bash
git add scripts/migrate-<short-description>.ts
git commit -m "chore: migrate <what changed>"
```

No changes to `package.json` needed — `npm run migrate` runs `scripts/run-migrations.ts`
which auto-discovers all `migrate-*.ts` files. The new script will be picked up automatically.

### 7. CD pipeline runs it automatically

On merge to `master` the CI pipeline runs:

```
Job 1 (CI) → Job 2 (E2E) → Job 3 (Migrate DB) → Job 4 (Deploy)
```

Job 3 (`npm run migrate`) connects to the Production MongoDB, checks the `migrations`
collection for already-applied scripts, and runs only the pending ones in order.
If any migration exits non-zero, Job 3 fails, a GitHub Issue is created, and
Job 4 (Deploy) is blocked until the issue is fixed.

The runner uses **MongoDB as the source of truth**, not git diff. This means:
- Fresh environments run all scripts (nothing recorded yet)
- Skipped deploys catch up — all pending scripts run in order
- Cherry-picked commits are safe — already-recorded scripts are skipped
- The "8 scripts, 3 already applied" case works correctly: runs the remaining 5

You do **not** need to run the migration manually against production — the pipeline handles it.
Running it locally beforehand is optional but useful to verify count/sample output.

---

## Existing migrations

| Script | What it does | Status |
|--------|-------------|--------|
| `migrate-installment-offers.ts` | Re-classifies `offerType="percentage"` + `discountPercentage=0` → `offerType="installment"` | ✅ Applied 2026-04-17 (96 records) |

---

## Notes

- Scripts live in `scripts/` and are auto-discovered by `scripts/run-migrations.ts` (no registration needed)
- Naming convention: `migrate-<description>.ts` — alphabetical order = run order; prefix with a date (`migrate-2026-04-17-description.ts`) if strict ordering matters
- The `migrations` collection in MongoDB tracks what has been applied — the runner records each script name after it exits 0
- **Never delete migration files** — the collection records names; deleting a file and re-adding it with the same name causes it to be skipped permanently
- `.env.local` must have `MONGODB_URI` set for local runs (same as the crawler)
- Never hard-code connection strings — always read from `process.env.MONGODB_URI`
- Migrations are one-way by design; to undo, write a new reverse migration script
- The CD pipeline (Job 3) always runs before deploy — safe to have 0 pending scripts (runner exits 0 immediately)
