/**
 * Unit tests for scripts/run-migrations.ts's discoverMigrationFiles().
 *
 * Regression test: a migrate-*.test.ts file previously matched the same
 * migrate-*.ts glob used to discover runnable migration scripts, so the CD
 * pipeline's migrate job tried to `tsx`-execute the vitest test file directly
 * and crashed before running the actual migration. See
 * scripts/migrate-consolidate-offer-categories.test.ts for the file that
 * triggered this.
 */
import { describe, it, expect } from "vitest";
import { discoverMigrationFiles } from "./run-migrations";

describe("discoverMigrationFiles", () => {
  it("excludes colocated *.test.ts files from the migration list", () => {
    const files = discoverMigrationFiles([
      "migrate-installment-offers.ts",
      "migrate-consolidate-offer-categories.ts",
      "migrate-consolidate-offer-categories.test.ts",
      "run-migrations.ts",
      "run-migrations.test.ts",
    ]);

    expect(files).toEqual([
      "migrate-consolidate-offer-categories.ts",
      "migrate-installment-offers.ts",
    ]);
  });

  it("only includes files starting with migrate- and ending in .ts", () => {
    const files = discoverMigrationFiles([
      "migrate-a.ts",
      "not-a-migration.ts",
      "migrate-b.js",
      "migrate-c.ts",
    ]);

    expect(files).toEqual(["migrate-a.ts", "migrate-c.ts"]);
  });

  it("returns files in alphabetical order", () => {
    const files = discoverMigrationFiles(["migrate-z.ts", "migrate-a.ts", "migrate-m.ts"]);

    expect(files).toEqual(["migrate-a.ts", "migrate-m.ts", "migrate-z.ts"]);
  });

  it("returns an empty array when no migration files are present", () => {
    expect(discoverMigrationFiles(["README.md", "run-migrations.ts"])).toEqual([]);
  });
});
