/**
 * Central migration runner — executed by the CD pipeline on every deploy.
 *
 * Discovers all scripts/migrate-*.ts files (alphabetical order) and runs
 * each one as a child process. Stops immediately if any migration exits
 * with a non-zero status.
 *
 * Migrations are idempotent: once applied they match nothing and exit
 * cleanly, so it is safe to run this on every deploy.
 *
 * Usage:
 *   npm run migrate          (local / CI)
 *   tsx scripts/run-migrations.ts
 */

import { readdirSync } from "fs";
import { spawnSync } from "child_process";
import { resolve, join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const migrationFiles = readdirSync(__dirname)
  .filter((f) => f.startsWith("migrate-") && f.endsWith(".ts"))
  .sort(); // alphabetical = chronological when files are prefixed with a date or sequence

if (migrationFiles.length === 0) {
  console.log("[migrations] No migration files found — nothing to run.");
  process.exit(0);
}

console.log(`[migrations] Found ${migrationFiles.length} migration(s): ${migrationFiles.join(", ")}`);

let allPassed = true;

for (const file of migrationFiles) {
  console.log(`\n[migrations] ▶  Running ${file} ...`);
  const result = spawnSync("tsx", [join(__dirname, file)], {
    stdio: "inherit",
    env: process.env,
  });

  if (result.status !== 0) {
    console.error(`[migrations] ❌ ${file} failed with exit code ${result.status}`);
    allPassed = false;
    break; // stop on first failure — don't apply later migrations on a broken state
  }

  console.log(`[migrations] ✅ ${file} completed`);
}

process.exit(allPassed ? 0 : 1);
