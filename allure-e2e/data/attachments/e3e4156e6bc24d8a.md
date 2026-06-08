# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: bundle-optimisation.spec.ts >> Bundle Optimisation (Feature 033) >> search drawer opens and searches correctly after dynamic load (T3)
- Location: e2e/bundle-optimisation.spec.ts:82:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('search-drawer-trigger')
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for getByTestId('search-drawer-trigger')

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - banner [ref=e3]:
      - generic [ref=e4]:
        - generic [ref=e5]: CardMax
        - generic [ref=e6]:
          - button "Switch to light mode" [ref=e7]:
            - img
          - link "Dashboard" [ref=e8] [cursor=pointer]:
            - /url: /admin
    - main [ref=e9]:
      - generic [ref=e11]:
        - generic [ref=e12]: Sri Lanka's Credit Card Offers
        - heading "Find the Best Card Deals" [level=1] [ref=e13]
        - paragraph [ref=e14]: Browse credit card deals from all major Sri Lankan banks — updated daily.
        - combobox [ref=e17]:
          - img
          - textbox "Search offers" [ref=e18]:
            - /placeholder: dining offers at Keells…
      - generic [ref=e20]:
        - generic [ref=e21]:
          - generic [ref=e22]:
            - heading "All Offers" [level=2] [ref=e23]
            - paragraph [ref=e24]: 0 offers found
          - button "Open filters" [ref=e26]:
            - img
            - text: Filters
        - generic [ref=e29]:
          - img [ref=e31]
          - heading "No offers found" [level=2] [ref=e34]
          - paragraph [ref=e35]: Try adjusting your filters or check back later for new offers.
      - generic [ref=e37]:
        - heading "Never Miss a Great Deal" [level=2] [ref=e38]
        - paragraph [ref=e39]: Browse offers from Sri Lanka's top banks, updated daily.
    - generic [ref=e42]:
      - paragraph [ref=e43]: Spotted a missing offer or wrong info? Let us know.
      - button "Send feedback" [ref=e44]:
        - img
        - text: Send feedback
    - contentinfo [ref=e45]:
      - generic [ref=e46]:
        - generic [ref=e47]:
          - generic [ref=e48]: CardMax
          - paragraph [ref=e49]: Sri Lanka's Credit Card Offers Aggregator
        - navigation "Footer links" [ref=e50]:
          - generic [ref=e51]: Privacy
          - generic [ref=e52]: Terms
          - generic [ref=e53]: Support
  - alert [ref=e54]
```

# Test source

```ts
  3   |  * Spec: specs/features/033-javascript-bundle-optimisation.md
  4   |  *
  5   |  * Resilient SSR pattern: DB may not be available in CI.
  6   |  * API calls are intercepted with mocked responses wherever needed.
  7   |  */
  8   | import { test, expect } from "@playwright/test";
  9   | 
  10  | const MOCK_OFFER = {
  11  |   _id: "mock-offer-bundle-1",
  12  |   bank: "commercial_bank",
  13  |   bankDisplayName: "Commercial Bank",
  14  |   merchant: "Keells Super",
  15  |   title: "Up to 15% off at Keells Super",
  16  |   category: "groceries",
  17  |   offerType: "percentage",
  18  |   discountLabel: "15% off",
  19  |   discountPercentage: 15,
  20  |   validFrom: "2026-01-01T00:00:00.000Z",
  21  |   validUntil: "2026-12-31T00:00:00.000Z",
  22  |   isExpired: false,
  23  |   sourceUrl: "https://www.combank.lk/offers",
  24  |   scrapedAt: "2026-01-01T00:00:00.000Z",
  25  |   createdAt: "2026-01-01T00:00:00.000Z",
  26  | };
  27  | 
  28  | const MOCK_RESPONSE = {
  29  |   data: [MOCK_OFFER],
  30  |   pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
  31  | };
  32  | 
  33  | const MOCK_CATEGORIES = [
  34  |   { category: "dining", label: "Dining", count: 42 },
  35  |   { category: "groceries", label: "Groceries", count: 31 },
  36  | ];
  37  | 
  38  | test.describe("Bundle Optimisation (Feature 033)", () => {
  39  |   // T2: Filter drawer opens and functions correctly after dynamic load
  40  |   test("filter drawer opens and applies filters after dynamic load (T2)", async ({ page }) => {
  41  |     await page.route("**/api/offers**", (route) =>
  42  |       route.fulfill({
  43  |         status: 200,
  44  |         contentType: "application/json",
  45  |         body: JSON.stringify(MOCK_RESPONSE),
  46  |       }),
  47  |     );
  48  |     await page.route("**/api/categories**", (route) =>
  49  |       route.fulfill({
  50  |         status: 200,
  51  |         contentType: "application/json",
  52  |         body: JSON.stringify({ data: MOCK_CATEGORIES }),
  53  |       }),
  54  |     );
  55  | 
  56  |     await page.goto("/");
  57  |     await page.waitForLoadState("domcontentloaded");
  58  | 
  59  |     // Resilient: accept either offers or empty state
  60  |     const offerGrid = page.getByTestId("offer-grid");
  61  |     const emptyState = page.getByTestId("empty-state");
  62  |     await expect(offerGrid.or(emptyState)).toBeVisible({ timeout: 10000 });
  63  | 
  64  |     // Filter drawer trigger must be present after dynamic load
  65  |     const drawerTrigger = page.getByTestId("filter-drawer-trigger");
  66  |     await expect(drawerTrigger).toBeVisible({ timeout: 10000 });
  67  | 
  68  |     // Open the filter drawer
  69  |     await drawerTrigger.click();
  70  |     const drawer = page.getByTestId("filter-drawer");
  71  |     await expect(drawer).toBeVisible({ timeout: 5000 });
  72  | 
  73  |     // Interact with bank filter
  74  |     await page.getByTestId("bank-filter-commercial_bank").click();
  75  |     await page.getByTestId("apply-filters").click();
  76  | 
  77  |     // URL should reflect the applied filter
  78  |     await expect(page).toHaveURL(/bank=commercial_bank/, { timeout: 10000 });
  79  |   });
  80  | 
  81  |   // T3: Search drawer opens and functions correctly after dynamic load
  82  |   test("search drawer opens and searches correctly after dynamic load (T3)", async ({ page }) => {
  83  |     await page.route("**/api/offers**", (route) =>
  84  |       route.fulfill({
  85  |         status: 200,
  86  |         contentType: "application/json",
  87  |         body: JSON.stringify(MOCK_RESPONSE),
  88  |       }),
  89  |     );
  90  |     await page.route("**/api/categories**", (route) =>
  91  |       route.fulfill({
  92  |         status: 200,
  93  |         contentType: "application/json",
  94  |         body: JSON.stringify({ data: MOCK_CATEGORIES }),
  95  |       }),
  96  |     );
  97  | 
  98  |     await page.goto("/");
  99  |     await page.waitForLoadState("domcontentloaded");
  100 | 
  101 |     // Search drawer trigger must be present in the header after dynamic load
  102 |     const searchTrigger = page.getByTestId("search-drawer-trigger");
> 103 |     await expect(searchTrigger).toBeVisible({ timeout: 10000 });
      |                                 ^ Error: expect(locator).toBeVisible() failed
  104 | 
  105 |     // Open search drawer by clicking the trigger
  106 |     await searchTrigger.click();
  107 | 
  108 |     // Drawer input must become visible
  109 |     const searchInput = page.getByTestId("search-drawer-input");
  110 |     await expect(searchInput).toBeVisible({ timeout: 5000 });
  111 | 
  112 |     // Type a search query and submit
  113 |     await searchInput.fill("keells");
  114 |     await searchInput.press("Enter");
  115 | 
  116 |     // URL should contain the search query
  117 |     await expect(page).toHaveURL(/q=keells/, { timeout: 10000 });
  118 |   });
  119 | 
  120 |   // T4: No JS errors in browser console after dynamic components load
  121 |   test("no JavaScript errors in browser console after dynamic components load (T4)", async ({ page }) => {
  122 |     const consoleErrors: string[] = [];
  123 | 
  124 |     page.on("console", (msg) => {
  125 |       if (msg.type() === "error") {
  126 |         consoleErrors.push(msg.text());
  127 |       }
  128 |     });
  129 | 
  130 |     page.on("pageerror", (err) => {
  131 |       consoleErrors.push(err.message);
  132 |     });
  133 | 
  134 |     await page.route("**/api/offers**", (route) =>
  135 |       route.fulfill({
  136 |         status: 200,
  137 |         contentType: "application/json",
  138 |         body: JSON.stringify(MOCK_RESPONSE),
  139 |       }),
  140 |     );
  141 |     await page.route("**/api/categories**", (route) =>
  142 |       route.fulfill({
  143 |         status: 200,
  144 |         contentType: "application/json",
  145 |         body: JSON.stringify({ data: MOCK_CATEGORIES }),
  146 |       }),
  147 |     );
  148 | 
  149 |     await page.goto("/");
  150 |     // Wait for dynamic components to load
  151 |     await page.waitForLoadState("networkidle");
  152 | 
  153 |     // Open filter drawer to trigger its dynamic chunk load
  154 |     const filterTrigger = page.getByTestId("filter-drawer-trigger");
  155 |     if (await filterTrigger.isVisible()) {
  156 |       await filterTrigger.click();
  157 |       await page.waitForTimeout(500);
  158 |       await page.keyboard.press("Escape");
  159 |     }
  160 | 
  161 |     // Open search drawer to trigger its dynamic chunk load
  162 |     const searchTrigger = page.getByTestId("search-drawer-trigger");
  163 |     if (await searchTrigger.isVisible()) {
  164 |       await searchTrigger.click();
  165 |       await page.waitForTimeout(500);
  166 |       await page.keyboard.press("Escape");
  167 |     }
  168 | 
  169 |     // Filter out known non-critical warnings and expected CI network failures.
  170 |     // "Failed to load resource" covers images, adsense, and other external
  171 |     // resources that are unavailable in the CI environment but are not JS errors.
  172 |     const realErrors = consoleErrors.filter(
  173 |       (msg) =>
  174 |         !msg.includes("Warning:") &&
  175 |         !msg.includes("Download the React DevTools") &&
  176 |         !msg.includes("Failed to load resource"),
  177 |     );
  178 | 
  179 |     expect(realErrors).toHaveLength(0);
  180 |   });
  181 | });
  182 | 
```