# Feature: Google AdSense Integration (014)

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [ ] Implementation started
- [ ] Tests written
- [ ] Done

## Purpose
Monetise the site's traffic by displaying contextually relevant ads from Google AdSense.
Ad units are placed in non-disruptive positions to maintain a good user experience while
generating revenue proportional to page views.

## User Story
As the site owner, I want ads to appear on the site so that the project generates revenue
that covers hosting costs and funds future development.

## Scope

### In Scope
- Three ad placement zones:
  1. **Between offer grid rows** — after every 8 cards in the grid
  2. **Sidebar** — right column on desktop (≥ 1280px), hidden on mobile
  3. **Top of filter drawer** — inside the Sheet component, above filters
- AdSense script loaded via `next/script` with `strategy="afterInteractive"`
- `<AdUnit>` client component wrapping `<ins class="adsbygoogle">`
- Responsive ad units (auto-sizing)
- AdSense publisher ID stored as an environment variable

### Out of Scope
- A/B testing ad placements
- Header bidding or custom ad server
- Affiliate links (separate feature)
- Ad analytics beyond AdSense dashboard

## Data Contract
No database changes. Ad unit IDs and publisher ID stored in environment variables.

## API Contract
No new API routes. AdSense script loaded from Google's CDN.

## Technical Approach

### AdSense script (`src/app/layout.tsx`)
```tsx
import Script from 'next/script';

// In RootLayout:
<Script
  async
  src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${process.env.NEXT_PUBLIC_ADSENSE_PUBLISHER_ID}`}
  crossOrigin="anonymous"
  strategy="afterInteractive"
/>
```

### AdUnit component (`src/components/ads/AdUnit.tsx`)
```tsx
'use client';
// useEffect to push to adsbygoogle queue
// Accepts: slotId, format ('auto'|'rectangle'|'horizontal'), className
// data-testid="ad-unit" for testing
```

### Grid injection (`src/components/cards/OfferGrid.tsx`)
- Insert `<AdUnit>` after every 8th `<OfferCard>` in the mapped array
- Only inject when `process.env.NEXT_PUBLIC_ADSENSE_ENABLED === 'true'`
- Guard: no ad on the last row if it would be immediately after the final card

### Environment variables
```
NEXT_PUBLIC_ADSENSE_PUBLISHER_ID=ca-pub-XXXXXXXXXXXXXXXX
NEXT_PUBLIC_ADSENSE_SLOT_GRID=XXXXXXXXXX
NEXT_PUBLIC_ADSENSE_SLOT_SIDEBAR=XXXXXXXXXX
NEXT_PUBLIC_ADSENSE_SLOT_DRAWER=XXXXXXXXXX
NEXT_PUBLIC_ADSENSE_ENABLED=true
```

### CLS / performance considerations
- Set explicit min-height on `<AdUnit>` containers to prevent Cumulative Layout Shift
- Horizontal unit in grid: min-height 90px (leaderboard) or 280px (large rectangle)
- Sidebar unit: min-height 250px (medium rectangle)
- Lazy-load ad units below the fold using Intersection Observer

## Acceptance Criteria
- [ ] AC1: AdSense script loads with `strategy="afterInteractive"` (does not block render)
- [ ] AC2: Ad unit appears between rows 8 and 9 of the offer grid
- [ ] AC3: Sidebar ad unit visible on desktop (≥ 1280px), hidden on mobile
- [ ] AC4: Ad unit appears at the top of the filter drawer
- [ ] AC5: No ad units render when `NEXT_PUBLIC_ADSENSE_ENABLED` is false/unset (default for dev/test)
- [ ] AC6: AdUnit component has `data-testid="ad-unit"` for testing
- [ ] AC7: Page CLS score remains ≤ 0.1 with ads enabled (Core Web Vital)
- [ ] AC8: Lighthouse performance score does not drop below 70 with ads enabled

## Test Cases

| Test | Type | AC |
|------|------|----|
| AdUnit renders ins element with correct slot | component | AC1, AC6 |
| Grid injects AdUnit after 8th card | component | AC2 |
| Grid does not inject AdUnit when ADSENSE_ENABLED is false | component | AC5 |
| Sidebar hidden on mobile via CSS | component | AC3 |

## Edge Cases
- Fewer than 8 offers returned — no grid ad injected (avoid showing only an ad)
- AdSense script blocked by ad blocker — no JS errors; `ins` element simply stays empty
- AdSense account not yet approved — use test ads (`data-adtest="on"` attribute) during development
- Pagination: ads re-injected on each page load (not persisted across paginations)

## Notes
- AdSense requires site approval — apply at https://www.google.com/adsense before implementing
- `NEXT_PUBLIC_ADSENSE_ENABLED=false` in `.env.local` and test environments prevents accidental ad loading
- RPM estimate for Sri Lanka traffic: ~$0.50–2.00/1000 page views. At 10k monthly views = $5–20/month
- AdSense auto-ads (automatic placement) is an alternative that avoids manual placement — enable via the AdSense dashboard after script inclusion
- Consider `next/script` `id` prop to prevent duplicate script insertion on client navigation
