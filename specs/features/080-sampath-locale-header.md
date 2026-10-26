# Feature: Sampath scraper — send the `locale` header the API now requires (080)

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [x] Implementation started
- [x] Tests written
- [ ] Done

## Purpose
`crawler/scrapers/sampath.ts` has returned 0 offers. Every request returned `200 OK` with
`{"data":[], ...}`, directly and through Bright Data. Live diagnostics (`scripts/debug-sampath-ntb.ts`,
workflow runs 40282113798 → 40283474044) loaded the offer page in a real headless Chromium and
captured its API call. Sampath's site still calls the same endpoint, `GET /api/card-promotions`
(no query string), and gets **135 promotions** in the unchanged response shape. Replaying that call
header by header showed exactly one header controls the result: **`locale: en`**. With it,
a plain server-side fetch returns all 135 promotions. Without it, `data` is always empty. Cookies,
user-agent, referer and the `sec-*` headers make no difference.

## Scope

### In Scope
- Send `locale: en` (and `platform: web`, which the site also sends) on the promotions request
- Call `/api/card-promotions` with no paging params, matching the site
- Skip promotions explicitly marked `enable: false` (the site's own list filters these out)

### Out of Scope
- Per-category fetching (the unfiltered endpoint returns every promotion once `locale` is set)
- Proxy changes: Sampath doesn't block direct requests, and proxy providers can't forward custom
  headers, so the existing proxy retries stay as a last resort only

## Data Contract
References: `specs/data/offer.schema.ts` — `OfferInputSchema`. The API response shape is
unchanged (`{ data: SampathPromotion[] }` with `id`, `company_name`, `short_discount`, `category`,
`expire_on`, `display_on`, `image_url`, `description`, `cards_new`, plus `enable`).

## Acceptance Criteria
- [ ] AC1: The promotions request goes to `https://www.sampath.lk/api/card-promotions` with a `locale: en` header
- [ ] AC2: Promotions with `enable: false` are skipped; ones with `enable: true` or no `enable` field are kept
- [ ] AC3: Existing mapping/validation/junk-filter/proxy-fallback behaviour is unchanged (existing tests pass)

## Test Cases

| Test | Type | AC |
|------|------|----|
| requests /api/card-promotions with a locale: en header | unit | AC1 |
| skips enable:false promotions and keeps enable:true / missing | unit | AC2 |
| existing sampath.test.ts suite | unit | AC3 |

## Edge Cases
- `company_name` values carry trailing newlines (`"Amaara Sky Hotel\n"`), which `cleanText()` already trims
- If Sampath drops the `locale` requirement, sending the header is harmless

## Documentation Impact
- README "Known Limitations" Sampath row points at this spec
