# Feature: Announce AI Offer-Extraction Feature via Announcement Banner (051)

**GitHub Issue**: #91

## Status
- [x] Spec drafted
- [x] Spec reviewed
- [x] Implementation started
- [x] Tests written
- [x] Done

## Purpose
Spec 044 (AI-assisted offer enrichment — semantic search field + precise
applicable-date extraction) and spec 045 (dismissible announcement banner) have both
shipped. This feature creates the actual announcement record that tells visitors
about the new AI-extraction capability, using the existing announcement banner
system rather than a code deploy. It is primarily an operational rollout step, but is
tracked as its own spec/migration (per `CLAUDE.md`'s `/run-migration` pattern) so it
is not silently skipped and so the record's creation is scripted, tested, and
repeatable rather than a one-off manual `curl`/admin-UI action.

## Scope

### In Scope
- A one-off DB migration script (per `.claude/commands/run-migration.md`) that
  inserts a new `Announcement` document via the `Announcement` Mongoose model (spec
  045) with:
  - `message`: a concise (<= 280 char, per `AnnouncementSchema.message`) description
    of the AI-extraction feature, e.g. "Offer descriptions and applicable dates are
    now AI-extracted for better accuracy — look for the sparkle."
  - `active: true`
  - `linkUrl`/`linkLabel` optional — omit unless a natural target page exists (there
    is no dedicated "learn more" page for spec 044, so this ships without a link)
- The migration must replicate spec 045's PATCH-handler invariant that only one
  announcement is active at a time: before inserting, it deactivates (`active: false`)
  any other currently-active announcement in the same script (mirroring
  `PATCH /api/announcements/:id`'s server-side behaviour), since a raw insert bypasses
  that route
- The migration must be idempotent: if an announcement with the same `message` already
  exists (e.g. the script is re-run), it should not create a duplicate — update the
  existing one's `active` flag instead

### Out of Scope
- Any change to the announcement banner UI, schema, or API routes (spec 045) — this
  only creates data using what already exists
- Deactivating this announcement later (a future admin action via the existing
  `/admin/announcements` UI or `PATCH /api/announcements/:id`, not part of this spec)
- Announcing any other feature — this migration is specific to the spec 044 rollout

## Data Contract
References: `specs/features/045-announcement-banner.md`'s `AnnouncementSchema`:
```ts
const AnnouncementSchema = z.object({
  _id: z.string().optional(),
  message: z.string().min(1).max(280),
  linkUrl: z.string().url().optional(),
  linkLabel: z.string().max(40).optional(),
  active: z.boolean().default(false),
  createdAt: z.coerce.date().optional(),
});
```
No schema changes — this spec only writes a document conforming to the existing shape.

## API Contract
No new or changed API routes. The migration script talks to the `Announcement`
Mongoose model directly (per `CLAUDE.md`'s "No raw MongoDB" rule — migrations still go
through the model), not through `POST /api/announcements`, since it needs to run
unattended without an authenticated admin session.

## UI Behaviour
No UI changes. Once the migration runs, the existing `AnnouncementBanner` component
(spec 045) will render this announcement's message at the top of the page for
visitors who haven't dismissed it, exactly as it does for any other active
announcement.

## Acceptance Criteria
- [x] AC1: Running the migration script creates exactly one new `Announcement`
      document with `active: true` and a message describing the AI-extraction feature
- [x] AC2: If any other announcement was `active: true` before the migration runs, it
      is set to `active: false` as part of the same script run
- [x] AC3: Running the migration script a second time does not create a duplicate
      announcement — it updates the existing one (matched by `message`) instead of
      inserting a new document
- [x] AC4: The created document validates against `AnnouncementSchema` (message <= 280
      chars, `active` boolean)
- [x] AC5: After the migration runs, `GET /api/announcements/active` returns this
      announcement (verifies AC1/AC2 end-to-end through the existing spec 045 API,
      not just the raw DB write)

## Test Cases
| Test | Type | AC |
|------|------|----|
| migration inserts a new active announcement when none exists | unit | AC1 |
| migration deactivates a previously-active announcement | unit | AC2 |
| running migration twice does not create a duplicate document | unit | AC3 |
| migration rejects/would fail Zod validation if message exceeds 280 chars (guard in script) | unit | AC4 |
| `GET /api/announcements/active` returns the migrated announcement after script runs | integration | AC5 |

## Edge Cases
- No existing announcements at all: migration still succeeds, simply inserts (AC1
  with no AC2 deactivation needed)
- Script run against a DB where an announcement with the exact same `message` exists
  but with `active: false`: treated as the idempotent "already exists" case (AC3) —
  flips it back to `active: true` rather than inserting a duplicate
- Message text exceeding 280 chars: script should validate against
  `AnnouncementSchema` before writing and fail loudly rather than silently truncating

## Notes
- Depends on: #79 / spec 044 (AI offer enrichment) — already shipped (merged in #92).
- Depends on: #80 / spec 045 (announcement banner) — already shipped.
- This is an operational/content rollout tracked as a spec so it goes through the same
  branch → PR → CI pipeline as any other change (per `CLAUDE.md`'s mandatory workflow),
  rather than being run as an untracked manual script against production.
- The exact announcement copy above is a suggested default; the implementer may
  adjust wording as long as it accurately describes the shipped spec 044 capability
  and stays within the 280-char `message` limit.
