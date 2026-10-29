# Feature: Offer Description Structure and Long-Text Layout (090)

**GitHub Issue**: #193

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [ ] Implementation started
- [ ] Tests written
- [ ] Done

## Purpose
HNB offer details (and every other bank's) stop mid-sentence because each scraper cuts
`description` to 300 characters, and HNB's bullet-style terms are flattened into one run-on line.
Spec 083 (#196) already removes the 300-char cap in every scraper through a shared
`truncateDescription(text, 2000)` helper. This spec covers what #193 asks for beyond that: keep the
paragraph and bullet structure the source provides, render that structure in the UI, make sure the
offer card and detail page lay out well with ~2000-character descriptions, and make sure the one-off
wave of re-enrichment that longer descriptions trigger is absorbed safely.

## Scope

### In Scope
- **Dependency:** this spec builds on spec 083's `truncateDescription()` (AC5/AC6 of 083). If 083's
  truncation step has not merged when this is implemented, implement 083's "Suggested order" step (1)
  first, in its own PR or as the first commit here, and tick it in 083's Status.
- **Structure-preserving HTML-to-text** helper `htmlToStructuredText(html: string): string` in
  `crawler/utils/` (e.g. `crawler/utils/htmlText.ts`):
  - block elements (`<p>`, `<div>`, `<br>`, `<h1>`–`<h6>`, `<tr>`) become line breaks (`\n`);
    consecutive blank lines collapse to a single blank line (`\n\n`);
  - each `<li>` becomes its own line prefixed with `• ` (nested lists are flattened, no indentation);
  - inline whitespace within a line collapses to a single space; every line is trimmed;
    leading/trailing blank lines are removed;
  - HTML entities used by bank sources (`&nbsp;`, `&amp;`, `&lt;`, `&gt;`, `&quot;`, `&#39;`, numeric
    `&#NNN;`) are decoded;
  - `<script>` / `<style>` content is dropped.
- **`truncateDescription()` must respect newlines:** when cutting, it prefers the last line break,
  then the last sentence end, then the last word boundary at or before `max - 1`, and never leaves a
  dangling `• ` bullet prefix or trailing blank line before the `…`. (Extend 083's helper; do not add
  a second truncation helper.)
- **HNB:** `extractDescription()` in `crawler/scrapers/hnb.ts` uses
  `htmlToStructuredText(item.content)` + `truncateDescription()` instead of
  `stripHtml(...).substring(0, 300)`. `detectCategory()` and `cleanText()` keep using the flat
  `stripHtml()` (category matching does not need structure).
- **Other HTML-sourced descriptions** (ComBank detail body, People's Bank detail terms, NTB detail
  terms once 083 adds them, BoC `.description`): switch their description text extraction to
  `htmlToStructuredText()` where the scraper has the source HTML fragment in hand. Sampath's
  `cards_new[]` title/description pairs are joined with `\n` (one pair per line) instead of a space.
- **UI rendering of line breaks:** the description elements render stored `\n` as visual line
  breaks via Tailwind `whitespace-pre-line`, with `break-words` so long unbroken tokens (URLs,
  hashtags) cannot overflow:
  - `src/components/offers/OfferDetailView.tsx` — `data-testid="offer-detail-description"`;
  - `src/components/cards/OfferCardExpanded.tsx` — `data-testid="offer-description"`.
- **Collapsed-state preview in `OfferCardExpanded`:** the collapsed preview (`DESC_LIMIT`, currently
  70 chars) is taken from the description with newlines collapsed to spaces, so a preview never shows
  a lone bullet or a line break; the expanded state shows the full structured text.
- **Long-text layout check:** with a ~2000-char, multi-paragraph, bulleted description, the
  detail page and the expanded card keep the page free of horizontal scroll at 375px and desktop
  widths, and the card grid row heights stay unaffected while the card is collapsed.
- **Re-enrichment wave:** longer/restructured descriptions change `description`, so
  `needsReEnrichment()` in `crawler/utils/db.ts` will flip many offers to `enrichmentStatus: "pending"`
  on the first crawl after release. The existing enrichment run (`crawler/enrichment/run.ts`) already
  leaves unprocessed offers `pending` for the next pass and halts on its circuit breaker. This spec
  requires no new mechanism, only that the implementer:
  - confirms with a unit test that a halted/partial run leaves remaining offers `pending` (not
    `failed` en masse) so they drain over later scheduled runs;
  - records in this spec's Notes the number of offers expected to flip (count of offers per bank
    whose stored `description` length is exactly 300 or ends mid-word, queried read-only via the
    admin tooling or a one-off read-only script) and the estimated number of enrichment runs needed
    to drain them at current Gemini/Groq free-tier limits (specs 044/057).

### Out of Scope
- Removing the 300-char cap itself and detail-page fetching — owned by spec 083.
- New schema fields (`terms`, `eligibleCards`, structured bullet arrays). `description` stays a plain
  string ≤ 2000; structure is carried by `\n` and `• ` only.
- Rich text / Markdown / HTML rendering in the UI. No `dangerouslySetInnerHTML`.
- Changes to enrichment prompts, quotas or provider strategy.
- A DB migration to rewrite existing descriptions — the next Daily Crawler run refreshes them.

## Data Contract
References: `specs/data/offer.schema.ts` — `OfferInputSchema` (no changes; `description` is
`z.string().max(2000).optional()` and may contain `\n`).

## API Contract
No changes. `GET /api/offers` and `GET /api/offers/{id}` already return `description` as a string;
it may now contain newline characters. See `specs/api/openapi.yaml`.

## UI Behaviour
- **Offer detail page (`/offers/:id`):** the description shows paragraphs and bulleted terms on
  separate lines, exactly as stored, wrapping within the content column.
- **Expanded offer card:** collapsed, the card shows a single-line-flow preview of the first 70
  characters + `…` and a "Show more" toggle; expanded, it shows the full structured description with
  line breaks; "Show less" collapses it again.
- Descriptions with no newlines (all existing data until re-scraped) look exactly as they do today.

## Acceptance Criteria
- [ ] AC1: `htmlToStructuredText()` converts `<p>`/`<br>`/`<div>`/headings to line breaks, `<li>` to
  `• `-prefixed lines, collapses inline whitespace and repeated blank lines, decodes the listed
  entities, drops `<script>`/`<style>`, and returns `""` for empty or tag-only input.
- [ ] AC2: `truncateDescription()` returns input ≤ max unchanged; for longer input it cuts at the last
  line break, else sentence end, else word boundary, ends in `…`, is ≤ max, and never ends with a
  dangling `• ` or a blank line before the `…`.
- [ ] AC3: **HNB:** given a captured `content` HTML fixture with paragraphs and a `<ul>` of terms
  (> 300 chars of text), `scrape()` returns a `description` that is > 300 chars, ≤ 2000, contains
  `\n`, and contains one `• ` line per `<li>`.
- [ ] AC4: **HNB:** a `content` fixture with > 2000 chars of text yields a description ≤ 2000 ending
  in `…`, cut on a line/sentence/word boundary (not mid-word).
- [ ] AC5: ComBank, People's Bank, BoC (and NTB once 083's detail fetch exists) build `description`
  through `htmlToStructuredText()` + `truncateDescription()`; each scraper's test asserts a
  multi-paragraph fixture keeps its line breaks. Sampath joins `cards_new[]` pairs with `\n`.
- [ ] AC6: No scraper's `description` contains raw HTML tags or undecoded `&nbsp;`/`&amp;` entities
  (asserted in each touched scraper's tests).
- [ ] AC7: `OfferDetailView`'s `offer-detail-description` element has `whitespace-pre-line` and
  `break-words`; a description with `\n` renders as separate visual lines.
- [ ] AC8: `OfferCardExpanded`'s `offer-description` element has `whitespace-pre-line` and
  `break-words`. Collapsed, the preview text contains no `\n` and is ≤ 70 chars + `…`; clicking
  `desc-toggle` shows the full text including line breaks; clicking again collapses it.
- [ ] AC9: E2E: with a mocked ~2000-char bulleted description, the offer detail page and an expanded
  offer card show the full text and the document has no horizontal scroll at 375px width.
- [ ] AC10: Existing single-line descriptions render unchanged (no extra blank lines, same preview).
- [ ] AC11: A unit test in `crawler/enrichment/run.test.ts` confirms that when the circuit breaker
  halts a run, offers not yet processed remain `pending` (their status is not written).
- [ ] AC12: The implementer records the expected re-enrichment wave size and drain estimate in this
  spec's Notes before marking it Done.
- [ ] AC13: All local verification gates pass (`type-check`, `lint`, `test`, `build`); no unit test
  makes a real network request.

## Test Cases

| Test | Type | AC |
|------|------|----|
| `htmlText.test.ts`: `<p>a</p><p>b</p>` → `"a\n\nb"` (or `"a\nb"`, per chosen block rule, asserted consistently) | unit | AC1 |
| `htmlText.test.ts`: `<ul><li>x</li><li>y</li></ul>` → `"• x\n• y"`; nested list flattened | unit | AC1 |
| `htmlText.test.ts`: `<br>` and headings become line breaks; repeated blank lines collapse | unit | AC1 |
| `htmlText.test.ts`: entities `&nbsp; &amp; &#39; &#8217;` decoded; `<script>`/`<style>` dropped | unit | AC1 |
| `htmlText.test.ts`: empty string and tag-only input → `""` | unit | AC1 |
| `truncate.test.ts`: ≤ max unchanged, no `…` | unit | AC2 |
| `truncate.test.ts`: long multi-line text cut at last `\n` before max, ends `…`, ≤ max | unit | AC2 |
| `truncate.test.ts`: cut never leaves trailing `• ` or blank line before `…` | unit | AC2 |
| `truncate.test.ts`: single-line long text falls back to sentence then word boundary | unit | AC2 |
| `hnb.test.ts`: captured paragraphs + `<ul>` fixture → description > 300, ≤ 2000, has `\n` and `• ` lines | unit | AC3, AC6 |
| `hnb.test.ts`: > 2000-char fixture → ≤ 2000, ends `…`, not mid-word | unit | AC4 |
| `combank.test.ts` / `peoples_bank.test.ts` / `boc.test.ts`: multi-paragraph fixture keeps line breaks, no tags/entities | unit | AC5, AC6 |
| `sampath.test.ts`: two `cards_new` pairs → description has one line per pair | unit | AC5 |
| `OfferDetailView.test.tsx`: `offer-detail-description` has `whitespace-pre-line` + `break-words`, renders text with `\n` | component | AC7 |
| `OfferCardExpanded.test.tsx`: collapsed preview has no `\n`, ≤ 70 chars + `…` | component | AC8 |
| `OfferCardExpanded.test.tsx`: `desc-toggle` expands to full structured text and collapses back | component | AC8 |
| `OfferCardExpanded.test.tsx`: single-line short description shows no toggle and is unchanged | component | AC10 |
| `e2e/offer-long-description.spec.ts`: mocked ~2000-char bulleted offer, detail page shows full text (resilient `offer-detail`/`offer-not-found` pattern) and `scrollWidth <= clientWidth` at 375px | e2e | AC9 |
| `e2e/offer-long-description.spec.ts`: home grid with mocked `/api/offers`, expand card, full text visible, no horizontal scroll at 375px | e2e | AC9 |
| `run.test.ts`: circuit breaker halts → unprocessed offers get no status write (remain `pending`) | unit | AC11 |
| Re-scrape updates stored descriptions and flips `enrichmentStatus` to `pending` | integration | AC12 — mock-based approximation in `db.test.ts` asserting `needsReEnrichment` is true when only `description` grows; `// TODO: integration test needs real DB` |

## Edge Cases
- Source HTML with only `<br>`-separated text and no block tags: lines still split on `<br>`.
- Source HTML with tables (T&C sometimes in `<table>`): each `<tr>` becomes a line, cells joined with
  ` – `; no table markup leaks.
- A single word longer than the max (very long URL): `truncateDescription` cuts mid-token as a last
  resort and still appends `…` (083 AC5 behaviour).
- `content` is `null`/missing: description stays `undefined`, as today.
- Descriptions containing `\r\n`: normalised to `\n` before rendering/storing.
- Search (`q` full-text) and AI enrichment receive text with newlines — both treat `\n` as
  whitespace; no change required, but enrichment tests should not assume single-line input.

## Documentation Impact
- `CLAUDE.md` → Architecture: add `crawler/utils/htmlText.ts → structure-preserving HTML-to-text for
  offer descriptions — spec 090` under the crawler tree.
- `README.md`: if a "Known Limitations" bullet mentions truncated descriptions, tick/remove it.

## Notes
- Related: spec 083 / #196 (owns the cap removal and detail fetching; its Out of Scope explicitly
  leaves #193's formatting and display checks to this spec), spec 044 / 057 (enrichment, quotas),
  spec 054 (People's detail-page validity).
- Choose one block-separation rule (`\n` vs `\n\n` between paragraphs) and use it consistently in
  helper, tests and UI; `\n\n` between paragraphs and `\n` between bullets reads best with
  `whitespace-pre-line`.
- Re-enrichment wave (fill in during implementation, per AC12):
  - Offers expected to flip to `pending`: _TBD_
  - Estimated enrichment runs to drain: _TBD_
