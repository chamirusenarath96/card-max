# Create a New Page

Use this skill when asked to add a new route/page to the card-max Next.js app.
It enforces the project's spec-first, component-test-driven, Tailwind-only standards.

---

## Context

- **Framework**: Next.js 16 App Router — pages live in `src/app/<route>/page.tsx`
- **Design system**: shadcn/ui + Tailwind CSS — no CSS modules, no styled-components
- **Design reference**: `DESIGN.md` documents component patterns and decisions
- **Spec first**: create `specs/features/<NNN>-<slug>.md` before writing code
- **Component tests**: every new component needs a `*.test.tsx` colocated next to it
- **Data fetching**: server components call `fetch()` / DB directly; client components use `useRouter`, `useSearchParams`
- **API routes**: serverless functions live in `src/app/api/<route>/route.ts`

---

## Steps

### 1 — Write the spec first

Create `specs/features/<next-number>-<slug>.md` using the template at
`specs/features/_template.md`.

The spec must define:
- **Purpose**: one sentence
- **User story**: "As a … I want … so that …"
- **Acceptance criteria**: numbered, testable statements
- **URL**: the page's route path
- **Data requirements**: what API/DB fields are needed

Do not write code until the spec is agreed.

### 2 — Scaffold the route

```
src/app/<route>/
  page.tsx          ← server component (data fetching + layout)
  loading.tsx       ← optional Suspense skeleton
  error.tsx         ← optional error boundary
  not-found.tsx     ← optional 404 handling
```

### 3 — Follow the layout conventions

Look at `src/app/page.tsx` for the established layout pattern:

```tsx
// src/app/<route>/page.tsx
import { Suspense } from "react";
// ... shadcn imports

export default async function MyPage({ searchParams }: PageProps) {
  const params = await searchParams;
  // fetch data server-side here

  return (
    <main className="min-h-screen bg-background">
      {/* Header — reuse the same nav pattern as page.tsx */}
      <header className="border-b">
        {/* ... */}
      </header>

      {/* Page content */}
      <div className="container mx-auto px-4 py-8">
        <Suspense fallback={<MySkeleton />}>
          <MyContent data={data} />
        </Suspense>
      </div>
    </main>
  );
}
```

### 4 — Design standards to follow

| Rule | Detail |
|---|---|
| Spacing | Use Tailwind spacing scale: `p-4`, `gap-3`, `mb-6` etc. |
| Typography | `text-foreground` for primary, `text-muted-foreground` for secondary |
| Cards | Use `<Card>` from `@/components/ui/card` with `rounded-2xl border border-border/50` |
| Badges | Use `<Badge>` for labels; colour-code by bank using `BANK_METADATA[bank].color` |
| Buttons | Use `<Button>` variants: `default`, `outline`, `ghost`, `secondary` |
| Loading | Use `<Skeleton>` components matching the real content shape |
| Responsive | Mobile-first: `flex-col` default, `md:flex-row` for wider layouts |
| Dark mode | Use semantic tokens (`bg-background`, `text-foreground`) — never hardcode colours |
| Icons | Lucide React only (`lucide-react` package) |
| Animations | `transition-all duration-300` for hover states |

### 5 — Extract components

Any reusable UI block should be a separate component file. Colocate it with the
page if it's page-specific, or put it in `src/components/` if shared.

Naming convention:
- `PascalCase` for component files: `OfferDetail.tsx`
- `data-testid` on every interactive element and major section

### 6 — Write component tests

Every component needs a `*.test.tsx` using Vitest + Testing Library:

```tsx
import { render, screen } from "@/test-utils";
import { describe, it, expect, vi } from "vitest";
import { MyComponent } from "./MyComponent";

describe("MyComponent", () => {
  it("renders the main heading", () => {
    render(<MyComponent />);
    expect(screen.getByRole("heading")).toBeInTheDocument();
  });
});
```

Use `@/test-utils` (not `@testing-library/react` directly) — it wraps with
required providers.

### 7 — Add an E2E test

Add a new `e2e/<slug>.spec.ts` following the pattern in `e2e/offers.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";

const MOCK_RESPONSE = { /* ... */ };

test.describe("<PageName>", () => {
  test("page renders without errors", async ({ page }) => {
    await page.route("**/api/<route>**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify(MOCK_RESPONSE) })
    );
    await page.goto("/<route>");
    await expect(page.getByTestId("<section-testid>")).toBeVisible();
  });
});
```

### 8 — Update navigation (if needed)

If the page is part of the main navigation, add a link in `src/app/page.tsx`
inside the `<NavigationMenuList>`:

```tsx
<NavigationMenuItem>
  <NavigationMenuLink href="/<route>" className={navigationMenuTriggerStyle()}>
    My Page
  </NavigationMenuLink>
</NavigationMenuItem>
```

### 9 — Run all checks and commit

```bash
npm run type-check  # must pass
npm run test        # must pass
npm run build       # must pass (no build errors)

git checkout -b feat/<slug>-page
git add src/app/<route>/ src/components/ specs/features/
git commit -m "feat(pages): add <page name> page"
git push origin feat/<slug>-page
# open PR — CI must be green before merging
```

---

## Reference: shadcn Components Available

Run `npx shadcn@latest add <component>` to install any component from
`https://ui.shadcn.com/docs/components`. Already installed in this project:

`accordion` · `badge` · `button` · `calendar` · `card` · `dialog` · `input`
`navigation-menu` · `pagination` · `popover` · `separator` · `sheet`
`skeleton` · `table` · `tabs` · `toast` · `tooltip`
