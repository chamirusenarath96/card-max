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
git add scripts/migrate-<short-description>.ts package.json
git commit -m "chore: migrate <what changed>"
```

---

## Existing migrations

| Script | What it does | When to run again |
|--------|-------------|-------------------|
| `migrate-installment-offers.ts` | Re-classifies `offerType="percentage"` + `discountPercentage=0` docs to `offerType="installment"` | After any bulk import of pre-regex scraper data |

---

## Notes

- Scripts live in `scripts/` and import from `crawler/utils/db` and `src/lib/models/`
- `.env.local` must have `MONGODB_URI` set (same as running the crawler locally)
- Never hard-code connection strings — always read from `process.env.MONGODB_URI`
- Migrations are one-way by design; if you need to roll back, write a reverse migration
