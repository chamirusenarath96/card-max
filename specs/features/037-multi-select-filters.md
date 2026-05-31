# Feature 037 — Multi-Select Filters

## Status
- [x] Spec drafted
- [x] Spec reviewed
- [ ] Implementation started
- [ ] Tests written
- [ ] Local gates passed
- [ ] Done

## Overview
Allow users to select **multiple values** for the bank, category, and offer-type
filters simultaneously. Currently each filter accepts a single value; this feature
expands each to a multi-value selection.

URL encoding uses repeated query-string parameters (standard HTTP):
```
?bank=hnb&bank=commercial_bank&category=dining&category=travel
```

## Acceptance Criteria

| AC | Description |
|----|-------------|
| AC1 | Users can select zero, one, or many banks; all selected banks' offers are returned |
| AC2 | Users can select zero, one, or many categories simultaneously |
| AC3 | Users can select zero, one, or many offer types simultaneously |
| AC4 | Multi-value selections are encoded as repeated URL params (`bank=a&bank=b`) |
| AC5 | "All Banks / All / All Types" button clears the respective selection when clicked |
| AC6 | Each selected chip shows as filled (variant="default"); unselected chips show as outline |
| AC7 | The active-filter count badge on the drawer trigger reflects the total number of selections across all dimensions |
| AC8 | Single-value URLs (`?bank=hnb`) remain backward-compatible — treated as a one-element selection |
| AC9 | The API builds `$in` queries when multiple values are present; single-value selections continue to match exactly |
| AC10 | All existing E2E and unit tests continue to pass |

## Implementation Notes

### URL format
Use `URLSearchParams.getAll('bank')` on both client (FilterDrawer) and server (API
route) to read all values for a parameter. Use `params.append('bank', value)` (not
`params.set`) to write multiple values.

### Schema (`offer.schema.ts`)
Add a `toArray` helper using `z.preprocess` so the schema accepts both a single
string and a string array for `bank`, `category`, and `offerType`:

```ts
const toArray = <T extends z.ZodTypeAny>(inner: T) =>
  z.preprocess(
    (v) =>
      v === undefined || v === null || (Array.isArray(v) && v.length === 0)
        ? undefined
        : Array.isArray(v) ? v : [v],
    z.array(inner).optional(),
  );

// In OfferQuerySchema:
bank:      toArray(BankSchema),
category:  toArray(CategorySchema),
offerType: toArray(OfferTypeSchema),
```

### API route (`/api/offers`)
Extract multi-values before passing to Zod:
```ts
const banks     = request.nextUrl.searchParams.getAll('bank').filter(Boolean);
const cats      = request.nextUrl.searchParams.getAll('category').filter(Boolean);
const types     = request.nextUrl.searchParams.getAll('offerType').filter(Boolean);

const rawParams = {
  ...Object.fromEntries(request.nextUrl.searchParams.entries()),
  ...(banks.length  ? { bank: banks }      : {}),
  ...(cats.length   ? { category: cats }   : {}),
  ...(types.length  ? { offerType: types } : {}),
};
```

Build `$in` filter:
```ts
if (bank?.length)      filter.bank      = { $in: bank };
if (category?.length)  filter.category  = { $in: category };
if (offerType?.length) filter.offerType = { $in: offerType };
```

### FilterDrawer state
```ts
const [pendingBanks,      setPendingBanks]      = useState<string[]>([]);
const [pendingCategories, setPendingCategories] = useState<string[]>([]);
const [pendingOfferTypes, setPendingOfferTypes] = useState<string[]>([]);
```

Toggle helper (adds/removes from array):
```ts
function toggle(arr: string[], val: string): string[] {
  return arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val];
}
```

Read from URL when drawer opens:
```ts
setPendingBanks(searchParams.getAll('bank'));
setPendingCategories(searchParams.getAll('category'));
setPendingOfferTypes(searchParams.getAll('offerType'));
```

Write to URL on Apply:
```ts
params.delete('bank');
pendingBanks.forEach(b => params.append('bank', b));
// same for category, offerType
```

### Props rename
`activeBank: string` → `activeBanks: string[]`
`activeCategory: string` → `activeCategories: string[]`
`activeOfferType: string` → `activeOfferTypes: string[]`

### page.tsx
Next.js searchParams values may be `string | string[]`:
```ts
function asArray(v: string | string[] | undefined): string[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}
```

## Test Cases

| # | Type | Description |
|---|------|-------------|
| T1 | unit | FilterDrawer: clicking two bank chips then Apply navigates with both `bank=` params |
| T2 | unit | FilterDrawer: clicking a selected bank chip again deselects it |
| T3 | unit | FilterDrawer: "All Banks" clears all bank selections |
| T4 | unit | API: `bank=hnb&bank=commercial_bank` builds `{ bank: { $in: ['hnb', 'commercial_bank'] } }` |
| T5 | unit | API: single `bank=hnb` still works (backward-compat) |
| T6 | unit | Active count badge reflects sum of all selected values |
| T7 | e2e  | Selecting two banks and applying shows offers from both |
