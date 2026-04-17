# Feature: MongoDB Atlas Search Migration (013)

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [ ] Implementation started
- [ ] Tests written
- [ ] Done

## Purpose
The current full-text search uses MongoDB's legacy `$text` operator with a standard
text index. This delivers limited relevance ranking and no partial-word matching.
Migrating to MongoDB Atlas Search (Lucene-based) enables scored relevance, fuzzy
matching, autocomplete, and field-weight control — all on the existing M0 free tier.

## User Story
As a user searching for merchants or offer descriptions, I want relevant results
ranked by match quality (not just keyword presence) so that the most useful offers
appear first even with partial or approximate search terms.

## Scope

### In Scope
- Replace `filter.$text` in `src/app/api/offers/route.ts` with a `$search` aggregation stage
- Create an Atlas Search index named `offers_search` on the `offers` collection
- Field coverage: `title` (weight 3), `merchant` (weight 2), `description` (weight 1)
- Lucene standard analyzer — works for English + transliterated Sri Lankan words
- Fuzzy matching: `maxEdits: 1` for terms ≥ 4 characters (handles typos)
- Zero-downtime migration: new Atlas Search index created alongside existing `$text` index,
  then `$text` index dropped after cutover
- `total` count via `$searchMeta` stage (replaces `countDocuments` for search queries)

### Out of Scope
- Language-specific Sinhala/Tamil analyzers (use `lucene.standard` for now)
- Autocomplete index (separate Atlas Search index type — future feature)
- Vector search / semantic search
- Faceted search counts (future feature)
- Changes to the search UI (`/src/components/search/`) — API contract is backwards-compatible

## Data Contract
No Mongoose schema changes. The new `$search` stage consumes existing fields.

```typescript
// Atlas Search index definition (created via Atlas UI or mongocli)
{
  "name": "offers_search",
  "definition": {
    "mappings": {
      "dynamic": false,
      "fields": {
        "title":       { "type": "string", "analyzer": "lucene.standard" },
        "merchant":    { "type": "string", "analyzer": "lucene.standard" },
        "description": { "type": "string", "analyzer": "lucene.standard" },
        "bank":        { "type": "string", "analyzer": "lucene.keyword" },
        "category":    { "type": "string", "analyzer": "lucene.keyword" },
        "isExpired":   { "type": "boolean" }
      }
    }
  }
}
```

## API Contract

### Endpoint (unchanged)
```
GET /api/offers?q=pizza
```
Request/response shape is unchanged. Behavioural change: results are relevance-ranked
when `q` is provided; behaviour when `q` is absent is unchanged (createdAt desc).

### Query Diff (`src/app/api/offers/route.ts`)

**Before (current):**
```typescript
// Full-text search
if (q && q.trim()) {
  filter.$text = { $search: q.trim() };
}
// ...
const [raw, total] = await Promise.all([
  OfferModel.find(filter).sort(sortOrder).skip(skip).limit(limit).lean(),
  OfferModel.countDocuments(filter),
]);
```

**After (Atlas Search):**
```typescript
if (q && q.trim()) {
  // Use $search aggregation pipeline instead of filter.$text
  const searchStage = {
    $search: {
      index: "offers_search",
      compound: {
        must: [{
          text: {
            query: q.trim(),
            path: ["title", "merchant", "description"],
            fuzzy: { maxEdits: 1 },
            score: {
              boost: {
                path: "title",  // title matches score higher
                undefined: 1,
              }
            }
          }
        }],
        filter: buildAtlasFilters(filter),  // translate filter to Atlas compound filter
      }
    }
  };

  const [raw, countResult] = await Promise.all([
    OfferModel.aggregate([
      searchStage,
      { $match: filter },  // apply remaining filters (dates, bank, category)
      { $sort: { score: { $meta: "searchScore" }, ...sortOrder } },
      { $skip: skip },
      { $limit: limit },
      { $project: { __v: 0 } },
    ]),
    OfferModel.aggregate([
      searchStage,
      { $match: filter },
      { $count: "total" },
    ]),
  ]);
  total = countResult[0]?.total ?? 0;
} else {
  // Non-search path unchanged
  [raw, total] = await Promise.all([
    OfferModel.find(filter).sort(sortOrder).skip(skip).limit(limit).lean(),
    OfferModel.countDocuments(filter),
  ]);
}
```

## Technical Approach

### Migration Strategy (Zero Downtime)

1. **Create Atlas Search index** via Atlas UI (Database → Search → Create Index)
   - Collection: `offers`
   - Index name: `offers_search`
   - Paste the index definition JSON from Data Contract above
   - Index build takes 1–5 min on M0; existing queries continue using `$text` during build

2. **Deploy updated `route.ts`** (uses `$search` when `q` is present)
   - The `$text` index still exists on the collection — no conflict
   - If Atlas Search is unavailable, add a try/catch that falls back to `$text`

3. **Verify** — run manual search queries against production, check result quality

4. **Drop the old `$text` index** via Atlas UI or migration script:
   ```typescript
   // scripts/migrations/drop-text-index.ts
   await OfferModel.collection.dropIndex("title_text_merchant_text_description_text");
   ```

5. **Remove fallback** from `route.ts` in a follow-up commit

### Field Weights via Score Boost
Atlas Search compound queries let `title` matches outrank `merchant` and `description`
matches by using a `boost` multiplier or placing higher-weight fields first in the
`path` array. The simplest approach: list fields in priority order and use `should`
clauses with `score.boost`:

```json
"should": [
  { "text": { "query": "...", "path": "title",       "score": { "boost": { "value": 3 } } } },
  { "text": { "query": "...", "path": "merchant",    "score": { "boost": { "value": 2 } } } },
  { "text": { "query": "...", "path": "description", "score": { "boost": { "value": 1 } } } }
]
```

### Atlas M0 Free Tier Support
Atlas Search is available on M0 (free tier) as of 2024. Index building is slower
than paid tiers (~5 min for 10k documents). Each search query counts against the
M0 shared cluster's ops limit.

## Acceptance Criteria
- [ ] AC1: Atlas Search index `offers_search` created with correct field mapping
- [ ] AC2: `GET /api/offers?q=pizza` returns results ranked by relevance score
- [ ] AC3: Fuzzy matching: `GET /api/offers?q=piza` returns pizza-related results
- [ ] AC4: Combined filter + search works: `GET /api/offers?q=pizza&bank=hnb`
- [ ] AC5: Non-search queries (`q` absent) use the original `find().sort()` path (unchanged)
- [ ] AC6: `total` count reflects Atlas Search result count (not full collection count)
- [ ] AC7: Old `$text` index dropped after successful cutover (no dead indexes)
- [ ] AC8: Response time for search queries remains < 500ms (P95)

## Test Cases

| Test | Type | AC |
|------|------|----|
| Search returns results scored by relevance | integration | AC2 |
| Typo `piza` returns pizza results (fuzzy) | integration | AC3 |
| Bank filter applied alongside text search | integration | AC4 |
| No `q` param → uses find() not aggregate() | unit | AC5 |
| `total` in pagination matches Atlas count | integration | AC6 |

## Edge Cases
- Atlas Search index not yet built (initialising) → queries fall back to `$text` search (catch `MongoServerError: index not found`)
- Empty `q` string (`q=`) → treat as absent, use normal `find()` path
- Special characters in query (`q=50%+off`) → Atlas Search tokenizes these correctly; no escaping needed
- Very short terms (`q=a`) → Atlas Search minimum token length is 1; returns many results; consider setting `minScore` threshold
- Concurrent crawl upsert during search → Atlas Search index updates in near-real-time (< 1s lag on M0)

## Notes
- Atlas Search index creation must be done manually via Atlas UI or `mongocli` — it cannot be done via Mongoose
- The index can also be defined in `atlas-app-services` config for GitOps-style management
- Monitor Atlas Search query performance in Atlas UI → Performance Advisor
- Future: add an `autocomplete` index on `merchant` field for the search dropdown (`$search` with `autocomplete` operator)
- After migration, remove the `$text` compound index from the Mongoose model to avoid confusion:
  ```typescript
  // In src/lib/models/offer.model.ts — remove:
  OfferSchema.index({ title: "text", merchant: "text", description: "text" });
  ```
