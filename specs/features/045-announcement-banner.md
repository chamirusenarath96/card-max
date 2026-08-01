# Feature: Dismissible Announcement Banner (045)

**GitHub Issue**: #80

## Status
- [ ] Spec drafted
- [ ] Spec reviewed
- [ ] Implementation started
- [ ] Tests written
- [ ] Done

## Purpose
Give the maintainer a way to communicate site-wide updates, known issues, and new
features to visitors via a persistent banner at the top of the page — without a code
deploy for each new announcement, and without annoying repeat visitors who already
dismissed it.

## Scope

### In Scope
- A new `announcements` MongoDB collection (via a new Mongoose model,
  `src/lib/models/announcement.model.ts`) storing: `message` (string), `linkUrl`
  (optional string), `linkLabel` (optional string), `active` (boolean), `createdAt`.
  Only one announcement should be `active: true` at a time; the banner displays the
  current active one (most-recently-created if more than one is somehow active)
- `GET /api/announcements/active` — public endpoint returning the current active
  announcement (`{ data: Announcement | null }`)
- Admin-only management under `/admin` (following spec 039's auth-gated admin
  pattern): create/list/activate/deactivate announcements. New API routes,
  session-gated the same way `/api/feedback` is today
- `AnnouncementBanner` client component, rendered once in the root layout
  (`src/app/layout.tsx`), above the main page content
- Dismiss button (`X` icon) that hides the banner and persists the dismissal in
  `localStorage`, keyed by the announcement's id, so it does not reappear on this
  device for *that specific* announcement (a new announcement with a different id
  shows again even if a previous one was dismissed) — follow the same client-only
  mount-guard + `localStorage` pattern already used by `useFilterPresets`
  (`src/hooks/useFilterPresets.ts`) to avoid SSR hydration mismatches
- Respect dark mode via existing semantic Tailwind tokens (`bg-card`,
  `text-foreground`, `border-border`, etc.) — no hardcoded colors
- No layout shift on mobile: banner takes up its own fixed space in normal document
  flow (not an absolutely-positioned overlay that covers content)

### Out of Scope
- Multiple simultaneously-visible announcements (only one active announcement shown
  at a time)
- Rich text / markdown in the announcement message — plain text plus one optional
  link
- Push notifications, email, or any channel other than the in-page banner
- Scheduling announcements to activate/deactivate automatically at a future date/time
  (only a manual `active` boolean toggle in this spec)

## Data Contract
References: `specs/data/offer.schema.ts` is **not** touched — this is a new,
independent collection, not part of the `Offer` model. New Zod schema (to live
alongside the new model, e.g. `src/lib/models/announcement.model.ts` or a small
co-located schema file — NOT added to `specs/data/offer.schema.ts`, which is
reserved for the offer data model per `CLAUDE.md`):

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

## API Contract

### Endpoints
```
GET  /api/announcements/active        — public; returns the current active announcement or null
GET  /api/announcements               — admin only; list all announcements
POST /api/announcements               — admin only; create a new announcement
PATCH /api/announcements/:id          — admin only; update `active` (and other fields)
```
- **`GET /api/announcements/active` response 200**: `{ data: Announcement | null }`
- **Admin endpoints response 401**: unauthenticated/non-admin request (same session
  gate pattern as `/admin/feedback` and its underlying API routes, per spec 039)
- Activating one announcement should deactivate any other currently-active one
  (server-side, inside the `PATCH` handler) so the "only one active at a time"
  invariant holds without relying on client discipline

## UI Behaviour
- When an active announcement exists and has not been dismissed on this device, a
  banner renders across the top of the page, above the header/nav, showing the
  message text and, if present, a link (e.g. "Learn more →")
- An `X` dismiss button on the right side of the banner; clicking it hides the
  banner immediately and stores the dismissal so it does not reappear for that same
  announcement id on this device
- If there is no active announcement, or the active one was already dismissed, no
  banner renders and no layout space is reserved
- Banner content and link are fully driven by the admin-managed data — no hardcoded
  announcement text in the component

## Technical Approach
- Follow `/new-page`-style conventions for the new admin sub-route (if a dedicated
  `/admin/announcements` management page is built) and standard API-route
  conventions (Zod validation, Mongoose model) for the new endpoints
- `AnnouncementBanner`:
  - Fetches `/api/announcements/active` client-side (or is passed server-fetched
    initial data from the root layout, if layout data-fetching conventions elsewhere
    in the app support it) on mount
  - Uses a `mounted` guard (`useState` + `useEffect`, mirroring
    `FilterPresetChips.tsx`) before reading `localStorage`, to avoid SSR hydration
    mismatch
  - `localStorage` key: `card-max:dismissed-announcement` storing the last-dismissed
    announcement id (a single string is sufficient since only one announcement is
    ever active at a time)
- `data-testid`s: `announcement-banner`, `announcement-banner-message`,
  `announcement-banner-link`, `announcement-banner-dismiss`

## Acceptance Criteria
- [ ] AC1: When an active announcement exists and has not been dismissed, the banner
      renders at the top of the page with its message
- [ ] AC2: When the optional link is present, it renders as a labeled link pointing
      to `linkUrl`
- [ ] AC3: Clicking the dismiss button hides the banner immediately
- [ ] AC4: After dismissing, reloading the page does not show the same announcement
      again (persisted via `localStorage`)
- [ ] AC5: A *new* active announcement (different id) shows even if a previous
      announcement was dismissed
- [ ] AC6: When there is no active announcement, no banner renders and no extra
      vertical space is reserved
- [ ] AC7: `GET /api/announcements/active` returns the most-recently-created
      `active: true` announcement, or `null` if none are active
- [ ] AC8: Activating an announcement via `PATCH /api/announcements/:id` deactivates
      any other currently-active announcement
- [ ] AC9: Non-admin requests to `POST /api/announcements` or
      `PATCH /api/announcements/:id` are rejected (401)
- [ ] AC10: The banner uses semantic Tailwind tokens only (no hardcoded colors) and
      renders correctly in both light and dark mode

## Test Cases

| Test | Type | AC |
|------|------|----|
| banner renders message when an active announcement is returned | component | AC1 |
| banner renders link when `linkUrl`/`linkLabel` present | component | AC2 |
| clicking dismiss hides the banner | component | AC3 |
| dismissed announcement id is written to `localStorage` | component | AC4 |
| banner does not render on remount when its id matches the stored dismissed id | component | AC4 |
| banner renders for a new announcement id even when a different id is stored as dismissed | component | AC5 |
| banner renders nothing when API returns `{ data: null }` | component | AC6 |
| `GET /api/announcements/active` returns the active announcement | unit | AC7 |
| `GET /api/announcements/active` returns `null` when none are active | unit | AC7 |
| `PATCH /api/announcements/:id` with `active: true` deactivates the previously-active row | unit | AC8 |
| `POST /api/announcements` without an admin session returns 401 | unit | AC9 |
| `PATCH /api/announcements/:id` without an admin session returns 401 | unit | AC9 |
| user sees banner, dismisses it, reloads page, banner stays hidden | e2e | AC3, AC4 |
| user sees no banner when no announcement is active | e2e | AC6 |

## Edge Cases
- `localStorage` unavailable or throws (private browsing, quota exceeded) — banner
  should fail open by rendering (better to show an extra banner than to silently
  break), matching `useFilterPresets`'s silent-catch pattern for writes
- Two announcements are marked `active: true` directly in the database (bypassing
  the API, e.g. a manual DB edit) — `GET /api/announcements/active` returns the
  most-recently-created one deterministically rather than an arbitrary one
- `message` at the 280-char limit — banner must not overflow or break layout on
  mobile; truncate visually with CSS if needed rather than breaking the schema limit
- Announcement is deactivated while a user already has the page open — the banner
  does not need to disappear live without a refresh/refetch (no real-time
  requirement in this spec)

## Notes
- Consider a future follow-up for scheduled activation windows (start/end dates) if
  the maintainer wants to queue up announcements in advance — explicitly out of
  scope here per the issue's own framing ("multiple past announcements can be
  authored but only the current one shown")
- Admin auth follows the existing single-`ADMIN_EMAIL` gate from spec 039 — no new
  auth mechanism introduced
