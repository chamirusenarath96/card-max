/**
 * Central migration runner — executed by the CD pipeline on every deploy.
 *
 * Uses a `migrations` collection in MongoDB as the source of truth for which
 * scripts have already been applied. This means:
 *
 *   - Fresh environments: all scripts run (nothing in the collection yet)
 *   - Partial environments: only unrecorded scripts run
 *   - Normal deploys: only new scripts added since the last deploy run
 *   - Cherry-picks / force pushes / skipped deploys: irrelevant — the DB
 *     state is the ground truth, not git history
 *
 * Flow per deploy:
 *   1. Connect to MongoDB
 *   2. Read `migrations` collection → set of already-applied script names
 *   3. Discover all scripts/migrate-*.ts files (alphabetical = run order)
 *   4. Subtract already-applied → pending list
 *   5. For each pending script: spawn as child process
 *      → success: insert { name, appliedAt } into `migrations`
 *      → failure: stop immediately, exit 1 (blocks the deploy job)
 *   6. Disconnect
 *
 * Usage:
 *   npm run migrate          (local / CI)
 *   tsx scripts/run-migrations.ts
 *
 * Requires MONGODB_URI in .env.local or the environment.
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { readdirSync } from "fs";
import { spawnSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Migrations collection schema ──────────────────────────────────────────────
// Intentionally inline — this is infrastructure, not a domain model.

const MigrationSchema = new mongoose.Schema({
  name:      { type: String, required: true, unique: true },
  appliedAt: { type: Date,   default: Date.now },
});

const MigrationModel =
  (mongoose.models.Migration as mongoose.Model<{ name: string; appliedAt: Date }>) ??
  mongoose.model("Migration", MigrationSchema);

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getAppliedMigrations(): Promise<Set<string>> {
  const docs = await MigrationModel.find({}, "name").lean();
  return new Set(docs.map((d) => d.name));
}

async function recordMigration(name: string): Promise<void> {
  await MigrationModel.create({ name, appliedAt: new Date() });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error("[migrations] MONGODB_URI is required");
    process.exit(1);
  }

  // Connect (reuse model's connection — same pattern as the crawler)
  await mongoose.connect(mongoUri, { dbName: "card-max" });
  console.log("[migrations] Connected to MongoDB");

  // 1. Which migrations have already been applied?
  const applied = await getAppliedMigrations();

  // 2. Discover all migrate-*.ts files in this directory
  const allFiles = readdirSync(__dirname)
    .filter((f) => f.startsWith("migrate-") && f.endsWith(".ts"))
    .sort(); // alphabetical order — prefix with a date or sequence number to control order

  // 3. Only run scripts that haven't been recorded yet
  const pending = allFiles.filter((f) => !applied.has(f.replace(/\.ts$/, "")));

  if (pending.length === 0) {
    console.log(
      `[migrations] All ${allFiles.length} migration(s) already applied — nothing to do.`
    );
    await mongoose.disconnect();
    return;
  }

  console.log(
    `[migrations] ${allFiles.length} total | ${applied.size} already applied | ${pending.length} pending: ${pending.join(", ")}`
  );

  // 4. Run each pending migration in order
  for (const file of pending) {
    const name = file.replace(/\.ts$/, "");
    console.log(`\n[migrations] ▶  Running ${file} ...`);

    const result = spawnSync("tsx", [join(__dirname, file)], {
      stdio: "inherit",
      env: process.env,
    });

    if (result.status !== 0) {
      console.error(
        `[migrations] ❌ ${file} failed with exit code ${result.status} — stopping.`
      );
      await mongoose.disconnect();
      process.exit(1); // blocks the deploy job
    }

    // Record success in the migrations collection
    await recordMigration(name);
    console.log(`[migrations] ✅ ${file} applied and recorded`);
  }

  console.log(`\n[migrations] Done — ${pending.length} migration(s) applied.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("[migrations] Fatal error:", err);
  process.exit(1);
});
