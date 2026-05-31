# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: cold-start-performance.spec.ts >> Cold-Start Performance (Feature 034) >> offer grid Suspense boundary renders skeleton or grid (T2)
- Location: e2e/cold-start-performance.spec.ts:125:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('offer-grid-skeleton').or(getByTestId('offer-grid-section')).or(getByTestId('empty-state'))
Expected: visible
Error: strict mode violation: getByTestId('offer-grid-skeleton').or(getByTestId('offer-grid-section')).or(getByTestId('empty-state')) resolved to 2 elements:
    1) <div data-testid="offer-grid-section">…</div> aka getByTestId('offer-grid-section')
    2) <div data-slot="card" data-size="default" data-testid="empty-state" class="group/card flex flex-col gap-4 overflow-hidden rounded-xl bg-card text-sm text-card-foreground ring-1 ring-foreground/10 has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:gap-3 data-[size=sm]:py-3 data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl border-dashed py-16 text-center shadow-none">…</div> aka getByTestId('empty-state')

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for getByTestId('offer-grid-skeleton').or(getByTestId('offer-grid-section')).or(getByTestId('empty-state'))

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - banner [ref=e3]:
      - generic [ref=e4]:
        - generic [ref=e5]: CardMax
        - navigation "Main" [ref=e6]:
          - list [ref=e8]:
            - listitem [ref=e9]:
              - link "Cards" [disabled] [ref=e10] [cursor=pointer]:
                - /url: "#"
            - listitem [ref=e11]:
              - link "Offers" [ref=e12] [cursor=pointer]:
                - /url: /
        - generic [ref=e13]:
          - button "Open search" [ref=e14]:
            - img
            - generic [ref=e15]: Search
            - generic [ref=e16]: Ctrl+K
          - button "Switch to light mode" [ref=e17]:
            - img
    - main [ref=e18]:
      - generic [ref=e20]:
        - generic [ref=e21]: Sri Lanka's Credit Card Offers
        - heading "Find the Best Card Deals" [level=1] [ref=e22]
        - paragraph [ref=e23]: Exclusive offers from Commercial Bank, Sampath, HNB & Nations Trust Bank — updated daily.
        - combobox [ref=e26]:
          - img
          - textbox "Search offers" [ref=e27]:
            - /placeholder: cashback on fuel…
      - generic [ref=e29]:
        - generic [ref=e30]:
          - generic [ref=e31]:
            - heading "All Offers" [level=2] [ref=e32]
            - paragraph [ref=e33]: 0 offers found
          - button "Open filters" [ref=e35]:
            - img
            - text: Filters
        - generic [ref=e38]:
          - img [ref=e40]
          - heading "No offers found" [level=2] [ref=e43]
          - paragraph [ref=e44]: Try adjusting your filters or check back later for new offers.
      - generic [ref=e46]:
        - heading "Never Miss a Great Deal" [level=2] [ref=e47]
        - paragraph [ref=e48]: Browse offers from Sri Lanka's top banks, updated daily.
    - contentinfo [ref=e50]:
      - generic [ref=e51]:
        - generic [ref=e52]:
          - generic [ref=e53]: CardMax
          - paragraph [ref=e54]: Sri Lanka's Credit Card Offers Aggregator
        - navigation "Footer links" [ref=e55]:
          - generic [ref=e56]: Privacy
          - generic [ref=e57]: Terms
          - generic [ref=e58]: Support
    - generic [ref=e59]:
      - button "Scroll to offers" [ref=e60]:
        - img
      - button "Scroll to top":
        - img
  - alert [ref=e61]
```

# Test source

```ts
  38  | };
  39  | 
  40  | const MOCK_RESPONSE = {
  41  |   data: [MOCK_OFFER],
  42  |   pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
  43  | };
  44  | 
  45  | // ── Helper: inject PerformanceObserver before navigation ──────────────────────
  46  | 
  47  | function webVitalsInitScript() {
  48  |   // Runs inside the browser — no imports or closures allowed.
  49  |   (window as unknown as Record<string, unknown>).__fcpMs = null;
  50  | 
  51  |   try {
  52  |     new PerformanceObserver((list) => {
  53  |       for (const entry of list.getEntries()) {
  54  |         if (entry.name === "first-contentful-paint") {
  55  |           (window as unknown as Record<string, unknown>).__fcpMs = entry.startTime;
  56  |         }
  57  |       }
  58  |     }).observe({ type: "paint", buffered: true });
  59  |   } catch {
  60  |     // Paint Timing API not available in this context — skip silently.
  61  |   }
  62  | }
  63  | 
  64  | // ── Desktop-only (performance budgets are viewport-dependent) ─────────────────
  65  | test.skip(({ isMobile }) => isMobile, "Cold-start performance budgets are desktop-only");
  66  | 
  67  | // ── Tests ─────────────────────────────────────────────────────────────────────
  68  | 
  69  | test.describe("Cold-Start Performance (Feature 034)", () => {
  70  |   /**
  71  |    * T1 — FCP ≤ 1,500 ms with mocked API
  72  |    *
  73  |    * The streaming Suspense architecture sends the page shell (header + hero)
  74  |    * before the offer grid data resolves. FCP should be driven by the shell,
  75  |    * not the DB query, staying well below 1,500 ms even with a cold DB.
  76  |    */
  77  |   test("FCP is below 1,500 ms with mocked API (AC4)", async ({ page }) => {
  78  |     await page.addInitScript(webVitalsInitScript);
  79  | 
  80  |     await page.route("**/api/offers**", (route) =>
  81  |       route.fulfill({
  82  |         status: 200,
  83  |         contentType: "application/json",
  84  |         body: JSON.stringify(MOCK_RESPONSE),
  85  |       }),
  86  |     );
  87  |     await page.route("**/api/categories**", (route) =>
  88  |       route.fulfill({
  89  |         status: 200,
  90  |         contentType: "application/json",
  91  |         body: JSON.stringify({ data: [] }),
  92  |       }),
  93  |     );
  94  | 
  95  |     await page.goto("/");
  96  |     await page.waitForLoadState("networkidle");
  97  |     // Yield to the event loop so the FCP PerformanceObserver can fire.
  98  |     await page.waitForTimeout(200);
  99  | 
  100 |     const fcpMs = await page.evaluate(
  101 |       () => (window as unknown as Record<string, unknown>).__fcpMs as number | null,
  102 |     );
  103 | 
  104 |     // Skip if the browser did not emit FCP (rare in headless environments).
  105 |     if (fcpMs === null) {
  106 |       test.skip();
  107 |       return;
  108 |     }
  109 | 
  110 |     // AC4: FCP must be below 1,500 ms — shell (header + hero) renders before DB data.
  111 |     expect(fcpMs).toBeLessThan(1500);
  112 |   });
  113 | 
  114 |   /**
  115 |    * T2 — Offer grid Suspense boundary renders skeleton or content
  116 |    *
  117 |    * Verifies that:
  118 |    *  - The Suspense boundary for the offer grid is present
  119 |    *  - Either the skeleton (offer-grid-skeleton) or the real grid is shown
  120 |    *
  121 |    * In CI (no DB), the server component resolves with empty data, so the
  122 |    * skeleton may have already transitioned to the empty state by the time
  123 |    * Playwright captures the DOM. The resilient assertion accepts both outcomes.
  124 |    */
  125 |   test("offer grid Suspense boundary renders skeleton or grid (T2)", async ({ page }) => {
  126 |     await page.goto("/");
  127 | 
  128 |     const skeleton = page.getByTestId("offer-grid-skeleton");
  129 |     const gridSection = page.getByTestId("offer-grid-section");
  130 |     const emptyState = page.getByTestId("empty-state");
  131 | 
  132 |     // Any of the three is a valid outcome:
  133 |     // - skeleton   → Suspense fallback still showing (streaming in progress)
  134 |     // - grid       → data resolved and offer cards rendered
  135 |     // - empty-state → data resolved with zero results (CI, no DB)
  136 |     await expect(
  137 |       skeleton.or(gridSection).or(emptyState),
> 138 |     ).toBeVisible({ timeout: 10000 });
      |       ^ Error: expect(locator).toBeVisible() failed
  139 |   });
  140 | 
  141 |   /**
  142 |    * T3 — Full page loads within 5 s end-to-end (integration proxy)
  143 |    *
  144 |    * TODO: integration test needs real DB
  145 |    * When MONGODB_URI is set, this test should verify the full offer grid
  146 |    * renders with real data within 5 s (AC6). The mock-based version below
  147 |    * verifies the structural path only.
  148 |    */
  149 |   test("full page load completes within 5 s with mocked API (T3 proxy)", async ({
  150 |     page,
  151 |   }) => {
  152 |     await page.route("**/api/offers**", (route) =>
  153 |       route.fulfill({
  154 |         status: 200,
  155 |         contentType: "application/json",
  156 |         body: JSON.stringify(MOCK_RESPONSE),
  157 |       }),
  158 |     );
  159 |     await page.route("**/api/categories**", (route) =>
  160 |       route.fulfill({
  161 |         status: 200,
  162 |         contentType: "application/json",
  163 |         body: JSON.stringify({ data: [] }),
  164 |       }),
  165 |     );
  166 | 
  167 |     const t0 = Date.now();
  168 |     await page.goto("/");
  169 | 
  170 |     // Accept offer-grid (data loaded) or empty-state (no DB in CI).
  171 |     const grid = page.getByTestId("offer-grid");
  172 |     const emptyState = page.getByTestId("empty-state");
  173 |     await expect(grid.or(emptyState)).toBeVisible({ timeout: 5000 });
  174 | 
  175 |     // Belt-and-suspenders: total elapsed must be under 5 s.
  176 |     expect(Date.now() - t0).toBeLessThan(5000);
  177 |   });
  178 | });
  179 | 
```