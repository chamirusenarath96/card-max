# Feature: Fix Bank-Hosted Merchant Logo Referrer/Hotlink Blocking (055)

**GitHub Issue**: #97

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [ ] Implementation started
- [ ] Tests written
- [ ] Done

## Purpose
`src/components/cards/OfferImage.tsx` renders the stored `merchantLogoUrl` with
`unoptimized` so bank-hosted images load directly in the browser rather than through
Vercel's Image Optimizer (which banks already block at the IP level). That does not
stop the browser from sending a `Referer` header on the direct `<img>` request, and
some banks reject hotlinked requests based on that header even though the same URL
works fine with no `Referer` (e.g. typed directly into the address bar). When that
request fails, `OfferImage`'s error handler falls through to the Google favicon
fallback (misleadingly named `buildClearbitUrl`), which renders a blurry generic globe
icon instead of the real logo. This spec stops the browser from sending a `Referer` on
the primary-stage image request.

## Scope

### In Scope
- Add `referrerPolicy="no-referrer"` to the `<Image>` element in `OfferImage.tsx` for
  the `primary` stage (the `merchantLogoUrl` render), so bank-hosted images aren't
  sent with a `Referer` header that triggers hotlink protection
- Spot-check the change against multiple banks' hosted images (not just People's
  Bank) after implementing, to confirm no bank CDN in use actually *requires* a
  same-origin referrer for some other reason
- Rename `buildClearbitUrl` (`crawler/utils/logo.ts`) to `buildFaviconFallbackUrl`
  (and its call site in `OfferImage.tsx`), since it calls Google's favicon service,
  not Clearbit, and the misleading name made this bug harder to diagnose
- A component test in `OfferImage.test.tsx` asserting the primary-stage `<Image>` has
  `referrerPolicy="no-referrer"` set

### Out of Scope
- Changing which stage the referrer policy applies to for the favicon-fallback stage
  — Google's favicon service isn't referrer-sensitive, so no change is needed there;
  only the primary bank-hosted stage is affected by this fix
- Any change to the fallback chain itself (primary → favicon → icon) or to
  `resolveMerchantImage`'s scrape-time resolution logic in `crawler/utils/logo.ts` —
  this is a render-time header fix, not a resolution-order change
- Auditing every bank's CDN for other client-side blocking mechanisms (e.g. CORS,
  `Sec-Fetch-*` headers) beyond `Referer` — out of scope unless the spot-check in this
  spec's acceptance criteria surfaces a concrete regression

## Data Contract
References: `specs/data/offer.schema.ts` — `OfferSchema.merchantLogoUrl` (optional
string). No schema changes — this is a render-time fix only.

## API Contract
No API changes.

## UI Behaviour
No new UI. The visible effect is that offer cards/detail pages for merchants whose
bank-hosted logo was previously blocked by referrer-based hotlink protection now show
the real logo instead of the blurry generic favicon fallback.

## Acceptance Criteria
- [ ] AC1: The primary-stage `<Image>` in `OfferImage.tsx` (rendering
      `offer.merchantLogoUrl`) has `referrerPolicy="no-referrer"` set
- [ ] AC2: The favicon-fallback stage's `<Image>` is unaffected (no referrer-policy
      change required there)
- [ ] AC3: `buildClearbitUrl` is renamed to `buildFaviconFallbackUrl` in
      `crawler/utils/logo.ts`, with its call site in `OfferImage.tsx` updated to match
      and no remaining references to the old name
- [ ] AC4: A spot check across at least 3 different banks' `merchantLogoUrl` values
      confirms the logo still loads correctly with `referrerPolicy="no-referrer"` set
      (no bank CDN in the current dataset requires a referrer)

## Test Cases

| Test | Type | AC |
|------|------|----|
| primary-stage Image has referrerPolicy="no-referrer" | component | AC1 |
| favicon-fallback stage still renders without a referrer-policy regression | component | AC2 |
| buildFaviconFallbackUrl is exported and used in place of buildClearbitUrl | unit | AC3 |

## Edge Cases
- `merchantLogoUrl` is `undefined` (no primary stage rendered at all) → unaffected,
  behaves as today (falls straight to favicon or icon stage)
- A bank's CDN that would have required a same-origin referrer for some other
  unrelated reason → covered by the spot-check in AC4; if this surfaces during
  implementation, it needs to be flagged rather than silently working around it
- Existing `onError` fallback chain (primary → favicon → icon) → unchanged; this fix
  only changes whether the primary-stage request is likely to fail, not what happens
  when it does

## Documentation Impact
None.

## Notes
- Root cause confirmed in the issue: the block is client-side (browser `Referer`
  header on direct `<img>` fetch), not server-side (Vercel optimizer IP block, which
  `unoptimized` already handles) — the fix is additive to the existing `unoptimized`
  approach, not a replacement for it
- The rename (`buildClearbitUrl` → `buildFaviconFallbackUrl`) is a small cleanup
  requested alongside the fix, not required for the fix itself, but should land in the
  same PR per the issue
- Related: #96 (spec 054, People's Bank validity dates) — different root cause, same
  bank flagged in the originating report, unrelated fix
