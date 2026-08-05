/**
 * Migration: create the announcement banner record for the AI offer-extraction
 * feature (spec 051, issue #91).
 *
 * Spec 044 (AI-assisted offer enrichment) and spec 045 (announcement banner)
 * have both shipped. This migration inserts the `Announcement` document that
 * tells visitors about the new AI-extraction capability, using the existing
 * announcement banner system rather than a code deploy.
 *
 * ── Idempotency guarantee ──────────────────────────────────────────────────
 * `findOneAndUpdate({ message }, { $set: { active: true } }, { upsert: true })`
 * matches (and updates in place) any existing document with this exact
 * `message` instead of inserting a duplicate — safe to re-run even if the
 * migrations collection record is lost.
 * ──────────────────────────────────────────────────────────────────────────
 *
 * Usage: npx tsx scripts/migrate-announce-ai-extraction.ts
 *
 * Requires MONGODB_URI in .env.local or the environment.
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { fileURLToPath } from "url";
import { connectDb, disconnectDb } from "../crawler/utils/db";
import { AnnouncementModel, AnnouncementInputSchema } from "../src/lib/models/announcement.model";

export const ANNOUNCEMENT_MESSAGE =
  "Offer descriptions and applicable dates are now AI-extracted for better accuracy — look for the sparkle.";

export async function main(message: string = ANNOUNCEMENT_MESSAGE): Promise<void> {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error("[migrate] MONGODB_URI is required");
    process.exit(1);
  }

  // Guard against an oversized message before touching the DB — AnnouncementSchema
  // caps `message` at 280 chars (spec 045).
  const parsed = AnnouncementInputSchema.safeParse({ message, active: true });
  if (!parsed.success) {
    throw new Error(
      `[migrate] Announcement fails schema validation: ${JSON.stringify(parsed.error.flatten())}`,
    );
  }

  await connectDb(mongoUri);

  // Mirror PATCH /api/announcements/:id's invariant that only one announcement
  // is active at a time — a raw insert bypasses that route, so replicate it here.
  const deactivated = await AnnouncementModel.updateMany(
    { message: { $ne: message }, active: true },
    { $set: { active: false } },
  );
  if (deactivated.modifiedCount > 0) {
    console.log(
      `[migrate] Deactivated ${deactivated.modifiedCount} previously-active announcement(s)`,
    );
  }

  const result = await AnnouncementModel.findOneAndUpdate(
    { message },
    { $set: { active: true } },
    { upsert: true, new: true },
  );
  console.log(`[migrate] ✅ Announcement ready — id=${result?._id}, active=${result?.active}`);

  await disconnectDb();
}

// Only auto-run when executed directly (`tsx scripts/migrate-*.ts`), not when
// imported — lets scripts/migrate-announce-ai-extraction.test.ts import and
// call `main()` itself without a duplicate run.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("[migrate] Fatal error:", err);
    process.exit(1);
  });
}
