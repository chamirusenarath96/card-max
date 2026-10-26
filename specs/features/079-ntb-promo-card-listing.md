# Feature: NTB scraper — parse promo cards from the listing page (079)

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [x] Implementation started
- [x] Tests written
- [ ] Done

## Purpose
`crawler/scrapers/ntb.ts` returns 0 offers. Live diagnostics (workflow runs 40212549540 and
40217127718, `scripts/debug-sampath-ntb.ts`) show the page is no longer blocked: via Bright Data
Web Unlocker the listing returns ~300KB of real HTML with no Incapsula marker. The cause is a
markup change. NTB now renders every offer as a card directly on the listing page, and the card
links are single-segment (`/promotions/<slug>`). `extractCampaignLinks()` only matches the old
two-segment `/promotions/<x>/<y>` detail-page links, so it finds nothing and the scraper gives up.

## Scope

### In Scope
- Parse offers straight from the listing page's `promo-box` cards (one card = one offer)
- Keep the old campaign-link → `<table>` flow as a fallback when no cards are found
- Keep the existing direct → proxy → Crawlee fallback chain unchanged

### Out of Scope
- Fetching each card's detail page (the card already carries merchant, offer, category, validity, image and link; fetching ~140 detail pages would also cost ~140 Bright Data requests per crawl)
- Changing the `LISTING_URL` (`/promotions/what-s-new` still returns the full listing)
- Sampath (tracked separately; its API returns `data: []` for every request variant)

## Data Contract
References: `specs/data/offer.schema.ts` — `OfferInputSchema`

Card markup observed on 2026-10-25:
```html
<div class="col-lg-3 col-md-6 col-sm-12 grid-item hotels-resorts">
  <div class="promo-box">
    <div class="promo-image">
      <img src="https://assets.nationstrust.com/2875/Avya-Cove@2x-100.jpg" alt="30% off with Mastercard Credit &amp; Debit Cards">
      <div class="tag">Hotels &amp; Resorts</div>
    </div>
    <div class="info">
      <h6>Aavya Cove Villas</h6>
      <h5>30% off with Mastercard Credit &amp; Debit Cards</h5>
    </div>
    <div class="promo-footer">
      <small>Valid till 31 October 2026</small>
      <a href="https://www.nationstrust.com/promotions/30-off-with-mastercard-credit-debit-cards-2" class="btn ...">Learn More</a>
    </div>
  </div>
</div>
```

| Card element | Offer field |
|---|---|
| `<h6>` | `merchant` |
| `<h5>` | `title`, `description`, input to `parseDiscount()` |
| `<div class="tag">` + merchant + offer text | `category` (via `detectCategory`) |
| `<small>Valid till …</small>` | `validUntil` (via `extractDates`) |
| `<img src>` | `merchantLogoUrl` |
| `<a href>` | `sourceUrl` |

## Acceptance Criteria
- [ ] AC1: When the listing HTML contains `promo-box` cards, `scrape()` returns one valid `OfferInput` per card, with merchant from `<h6>`, title/description from `<h5>`, `sourceUrl` from the card link, `merchantLogoUrl` from the card image, and `validUntil` parsed from "Valid till D Month YYYY"
- [ ] AC2: The card's category tag feeds category detection (e.g. "Hotels & Resorts" → `travel`)
- [ ] AC3: Cards missing a merchant (`<h6>`) or a link are skipped; duplicate card links produce one offer
- [ ] AC4: When the listing has no `promo-box` cards, the existing campaign-link → table flow still runs (existing tests keep passing)
- [ ] AC5: Card parsing applies equally to a listing fetched via a proxy provider after a direct-fetch failure (CloudFront 403)

## Test Cases

| Test | Type | AC |
|------|------|----|
| parses promo-box cards from the listing into offers | unit | AC1 |
| maps the card tag to a category | unit | AC2 |
| skips cards without merchant/link and dedupes by link | unit | AC3 |
| existing "returns valid OfferInput objects when HTTP succeeds" (table flow) | unit | AC4 |
| parses cards from a proxy-fetched listing when the direct fetch throws HTTP 403 | unit | AC5 |

## Edge Cases
- HTML entities in card text (`&amp;`) are decoded by `cleanText()`
- Cards without a validity line → `validUntil` undefined (schema allows it)
- Non-offer `/promotions/...` links on the page (e.g. `general-terms-and-condition-for-offers`, language switchers) are not inside `promo-box` cards, so they are ignored

## Documentation Impact
- README "Known Limitations" row for NTB updated to point at this spec
