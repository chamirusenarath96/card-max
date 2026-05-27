# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: accessibility.spec.ts >> Accessibility fixes (Feature 032) >> hero search input does not carry aria-expanded (T3 — ARIA mismatch fix)
- Location: e2e/accessibility.spec.ts:48:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('hero-search').or(getByTestId('empty-state'))
Expected: visible
Error: strict mode violation: getByTestId('hero-search').or(getByTestId('empty-state')) resolved to 2 elements:
    1) <div data-testid="hero-search" class="flex flex-col items-center gap-5">…</div> aka getByTestId('hero-search')
    2) <div data-slot="card" data-size="default" data-testid="empty-state" class="group/card flex flex-col gap-4 overflow-hidden rounded-xl bg-card text-sm text-card-foreground ring-1 ring-foreground/10 has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:gap-3 data-[size=sm]:py-3 data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl border-dashed py-16 text-center shadow-none">…</div> aka getByTestId('empty-state')

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for getByTestId('hero-search').or(getByTestId('empty-state'))

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
  1   | /**
  2   |  * E2E accessibility tests — spec 032 (WCAG AA fixes)
  3   |  *
  4   |  * Uses Playwright's accessibility snapshot to verify key ARIA roles and
  5   |  * checks that ARIA attributes are correctly placed. All /api/offers calls
  6   |  * are mocked so tests run without a live DB.
  7   |  */
  8   | import { test, expect } from "@playwright/test";
  9   | 
  10  | const MOCK_OFFER = {
  11  |   _id: "mock-offer-1",
  12  |   bank: "commercial_bank",
  13  |   bankDisplayName: "Commercial Bank",
  14  |   merchant: "Keells Super",
  15  |   title: "Up to 15% off at Keells",
  16  |   category: "groceries",
  17  |   offerType: "percentage",
  18  |   discountLabel: "15% off",
  19  |   discountPercentage: 15,
  20  |   isExpired: false,
  21  |   sourceUrl: "https://www.combank.lk/offers",
  22  |   scrapedAt: new Date().toISOString(),
  23  | };
  24  | 
  25  | const MOCK_RESPONSE = {
  26  |   data: [MOCK_OFFER],
  27  |   pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
  28  | };
  29  | 
  30  | test.describe("Accessibility fixes (Feature 032)", () => {
  31  |   test.beforeEach(async ({ page }) => {
  32  |     await page.route("**/api/offers**", (route) =>
  33  |       route.fulfill({
  34  |         status: 200,
  35  |         contentType: "application/json",
  36  |         body: JSON.stringify(MOCK_RESPONSE),
  37  |       }),
  38  |     );
  39  |     await page.route("**/api/categories**", (route) =>
  40  |       route.fulfill({
  41  |         status: 200,
  42  |         contentType: "application/json",
  43  |         body: JSON.stringify({ data: [{ category: "dining", label: "Dining", count: 5 }] }),
  44  |       }),
  45  |     );
  46  |   });
  47  | 
  48  |   test("hero search input does not carry aria-expanded (T3 — ARIA mismatch fix)", async ({ page }) => {
  49  |     await page.goto("/");
  50  | 
  51  |     // Wait for the page to render
  52  |     const heroSearch = page.getByTestId("hero-search");
  53  |     const notFound = page.getByTestId("empty-state");
> 54  |     await expect(heroSearch.or(notFound)).toBeVisible({ timeout: 10000 });
      |                                           ^ Error: expect(locator).toBeVisible() failed
  55  | 
  56  |     // The <input> itself must NOT have aria-expanded
  57  |     const input = page.getByTestId("hero-search-input");
  58  |     const ariaExpanded = await input.getAttribute("aria-expanded");
  59  |     expect(ariaExpanded).toBeNull();
  60  |   });
  61  | 
  62  |   test("combobox container carries role=combobox and aria-haspopup=listbox (T3)", async ({ page }) => {
  63  |     await page.goto("/");
  64  | 
  65  |     const heroSearch = page.getByTestId("hero-search");
  66  |     const notFound = page.getByTestId("empty-state");
  67  |     await expect(heroSearch.or(notFound)).toBeVisible({ timeout: 10000 });
  68  | 
  69  |     // The container wrapping the input should have role="combobox"
  70  |     const combobox = page.locator('[role="combobox"]').first();
  71  |     await expect(combobox).toBeInViewport({ timeout: 5000 });
  72  |     await expect(combobox).toHaveAttribute("aria-haspopup", "listbox");
  73  |   });
  74  | 
  75  |   test("footer uses text-foreground/70 class, not text-muted-foreground (T1 — contrast fix)", async ({ page }) => {
  76  |     await page.goto("/");
  77  | 
  78  |     const footer = page.getByTestId("site-footer");
  79  |     await expect(footer).toBeVisible({ timeout: 10000 });
  80  | 
  81  |     // Footer tagline must use text-foreground/70 for WCAG AA contrast
  82  |     const tagline = page.getByTestId("footer-tagline");
  83  |     await expect(tagline).toBeVisible();
  84  |     const taglineClass = await tagline.getAttribute("class");
  85  |     expect(taglineClass).toContain("text-foreground");
  86  |     expect(taglineClass).not.toContain("text-muted-foreground");
  87  |   });
  88  | 
  89  |   test("offer card bank badge uses full color (no alpha reduction) (T2)", async ({ page }) => {
  90  |     await page.goto("/");
  91  | 
  92  |     // Resilient pattern: accept loaded or empty state
  93  |     const offerGrid = page.getByTestId("offer-grid");
  94  |     const emptyState = page.getByTestId("empty-state");
  95  |     await expect(offerGrid.or(emptyState)).toBeVisible({ timeout: 10000 });
  96  | 
  97  |     // If offers are visible, check the bank badge style
  98  |     const bankBadge = page.getByTestId("offer-bank").first();
  99  |     const isBadgeVisible = await bankBadge.isVisible().catch(() => false);
  100 |     if (isBadgeVisible) {
  101 |       const style = await bankBadge.getAttribute("style");
  102 |       // The badge should have a background-color without the 'dd' alpha suffix
  103 |       expect(style ?? "").not.toMatch(/[0-9a-fA-F]{6}dd['";\s]|dd['";\s]/);
  104 |     }
  105 |   });
  106 | });
  107 | 
```