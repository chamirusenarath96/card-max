# Feature: Keyword Search (003)

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [ ] Implementation started
- [ ] Tests written
- [ ] Done

## Purpose
Allow users to search across all offers by keyword (e.g. "pizza", "fuel", "online shopping") to quickly find relevant deals without knowing which bank has them.

## Scope

### In Scope
- Full-text search on: title, description, merchant name
- Debounced search input (300ms)
- Search results replace the filtered offer grid
- Clear search button

### Out of Scope
- AI/semantic search (future)
- Search history (future)
- Search within a specific bank only (covered by combining with filter)

## Data Contract
References: `specs/data/offer.schema.ts` — `OfferQuerySchema` (extend with `q` param)

## API Contract
```
GET /api/offers?q=pizza&bank=commercial_bank&page=1
```
Search is combined with existing filters.

## Acceptance Criteria
- [ ] AC1: Search input is debounced (300ms)
- [ ] AC2: Searching updates URL param `?q=...`
- [ ] AC3: Results match offers where title, description, or merchant contains the query (case-insensitive)
- [ ] AC4: Empty query shows all offers (no search filter)
- [ ] AC5: "No results for [query]" shown when search returns zero
- [ ] AC6: Search can be combined with bank/category filters

## Notes
- MongoDB text index on `title`, `description`, `merchant` fields
- For now, use MongoDB `$text` search — upgrade to Atlas Search later if needed
