/**
 * Generates dashboard/index.html linking all CI report panels.
 *
 * Panels:
 *   - Allure unit test report  → ./allure-unit/index.html  (with per-suite breakdown)
 *   - Allure E2E report        → ./allure-e2e/index.html   (with per-suite breakdown)
 *   - Lighthouse CI report     → ./lighthouse/ (may be absent)
 *   - Lighthouse User Flow     → ./lighthouse-user-flow/ (may be absent)
 *   - GitHub Actions status badges (shields.io SVG)
 *
 * Run: node scripts/build-dashboard-index.js
 * Env: DASHBOARD_DIR_OVERRIDE — override output directory (used in tests)
 */

const fs = require("fs");
const path = require("path");

const REPO_OWNER = "chamirusenarath96";
const REPO_NAME = "card-max";

const DASHBOARD_DIR =
  process.env.DASHBOARD_DIR_OVERRIDE ||
  path.join(__dirname, "..", "dashboard");

/** Returns true if a file or directory exists at the given path. */
function exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

function badgeUrl(workflowFile) {
  return `https://github.com/${REPO_OWNER}/${REPO_NAME}/actions/workflows/${workflowFile}/badge.svg`;
}

function workflowUrl(workflowFile) {
  return `https://github.com/${REPO_OWNER}/${REPO_NAME}/actions/workflows/${workflowFile}`;
}

const WORKFLOWS = [
  { file: "ci.yml", label: "CI / Deploy" },
  { file: "crawler.yml", label: "Crawler" },
  { file: "dashboard.yml", label: "CI Dashboard" },
];

/**
 * Recursively walks an Allure tree node and accumulates test statuses
 * into the byFile map, keyed by the nearest ancestor whose name looks
 * like a source file (ends in .ts / .tsx / .js).
 *
 * Handles both flat structures (unit: root > file > test) and deep
 * structures (E2E: root > browser > spec > describe > test).
 *
 * @param {object} node       - Current Allure tree node
 * @param {string} currentKey - Nearest file-like ancestor name seen so far
 * @param {object} byFile     - Accumulator: filename → { passed, failed, broken, skipped }
 */
function walkNode(node, currentKey, byFile) {
  const isFile = /\.(test|spec)\.(tsx?|js)$/.test(node.name);
  const key = isFile ? node.name : currentKey;

  if (node.status) {
    // Leaf test node — accumulate into whichever file key is active.
    const bucket = byFile[key] || (byFile[key] = { passed: 0, failed: 0, broken: 0, skipped: 0 });
    const s = node.status;
    if (s === "passed") bucket.passed++;
    else if (s === "failed") bucket.failed++;
    else if (s === "broken") bucket.broken++;
    else if (s === "skipped") bucket.skipped++;
  }

  for (const child of node.children || []) {
    walkNode(child, key, byFile);
  }
}

/**
 * Reads an Allure suites.json file and returns per-suite pass/fail stats.
 * Works for both unit test flat trees and deep E2E trees (browser > spec > describe > test).
 * @param {string} suitesJsonPath  Absolute path to the allure data/suites.json file.
 * @returns {object|null} Object with suites array and totals, or null if file missing.
 */
function readAllureSuites(suitesJsonPath) {
  if (!exists(suitesJsonPath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(suitesJsonPath, "utf8"));

    // Walk the entire tree, grouping by source file name.
    const byFile = {};
    for (const child of raw.children || []) {
      walkNode(child, child.name, byFile);
    }

    const suites = Object.entries(byFile)
      .map(([name, counts]) => ({
        name,
        ...counts,
        total: counts.passed + counts.failed + counts.broken + counts.skipped,
      }))
      .filter((s) => s.total > 0)
      .sort((a, b) => a.name.localeCompare(b.name));

    const totals = suites.reduce(
      (acc, s) => ({
        passed: acc.passed + s.passed,
        failed: acc.failed + s.failed,
        broken: acc.broken + s.broken,
        skipped: acc.skipped + s.skipped,
        total: acc.total + s.total,
      }),
      { passed: 0, failed: 0, broken: 0, skipped: 0, total: 0 }
    );
    return { suites, totals };
  } catch {
    return null;
  }
}

/** Strips path prefix and .test.ts/.spec.ts suffix for a clean label. */
function suiteName(raw) {
  return raw
    .replace(/^(src\/|crawler\/|scripts\/|e2e\/)/, "")
    .replace(/\.(test|spec)\.(tsx?|js)$/, "");
}

/**
 * Reads the interaction-timing.json written by e2e/interaction-timing.spec.ts.
 * Returns the parsed payload or null if the file is missing / malformed.
 * @param {string} testResultsDir  Absolute path to the test-results directory.
 * @returns {{ timestamp: string, budgetMs: number, results: Record<string, number|null> }|null}
 */
function readTimingResults(testResultsDir) {
  const p = path.join(testResultsDir, "interaction-timing.json");
  if (!exists(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

/** Labels for timing keys — in display order. */
const TIMING_LABELS = {
  "bank-filter":      "Bank filter (select + apply)",
  "category-filter":  "Category filter (select + apply)",
  "clear-all-filters":"Clear all filters",
  "pagination-next":  "Pagination next page",
  "drawer-open":      "Filter drawer open",
  "drawer-close":     "Filter drawer close",
};

/** Renders the interaction timing panel HTML. */
function timingPanel(timingData) {
  if (!timingData) {
    return `    <section class="panel panel--unavailable" data-testid="timing-panel">
      <h2>Interaction Timing</h2>
      <p class="unavailable" data-testid="timing-unavailable">No timing data — run E2E tests to generate.</p>
    </section>`;
  }

  const { budgetMs, results } = timingData;
  const allPass = Object.values(results).every((v) => v === null || v < budgetMs);

  const rows = Object.entries(TIMING_LABELS)
    .map(([key, label]) => {
      const ms = results[key];
      if (ms === null || ms === undefined) {
        return `<tr>
          <td><span class="dot" style="background:#555"></span></td>
          <td class="suite-name">${label}</td>
          <td class="suite-pills"><span class="pill" style="background:#21262d;color:#8b949e">skipped</span></td>
        </tr>`;
      }
      const pass = ms < budgetMs;
      const dot = pass ? "dot--pass" : "dot--fail";
      const pill = pass
        ? `<span class="pill pill--pass">${ms}ms ✓</span>`
        : `<span class="pill pill--fail">${ms}ms ✗ &gt;${budgetMs}ms</span>`;
      return `<tr>
          <td><span class="dot ${dot}"></span></td>
          <td class="suite-name">${label}</td>
          <td class="suite-pills">${pill}</td>
        </tr>`;
    })
    .join("\n");

  const panelClass = allPass ? "panel panel--pass" : "panel panel--fail";

  return `    <section class="${panelClass}" data-testid="timing-panel">
      <h2>Interaction Timing</h2>
      <div class="total-bar ${allPass ? "total-bar--pass" : "total-bar--fail"}">
        <span class="total-count">Budget: ${budgetMs}ms per interaction</span>
      </div>
      <table class="suite-table">
        <tbody>
          ${rows}
        </tbody>
      </table>
    </section>`;
}

/** Renders a coloured suite breakdown table. */
function suitesTable(data) {
  if (!data) return `<p class="unavailable">No Allure data found.</p>`;

  const { suites, totals } = data;
  const overallOk = totals.failed === 0 && totals.broken === 0;

  const totalBar = `<div class="total-bar ${overallOk ? "total-bar--pass" : "total-bar--fail"}">
      <span class="total-count">${totals.total} tests</span>
      <span class="pill pill--pass">${totals.passed} passed</span>
      ${totals.failed > 0 ? `<span class="pill pill--fail">${totals.failed} failed</span>` : ""}
      ${totals.broken > 0 ? `<span class="pill pill--broken">${totals.broken} broken</span>` : ""}
      ${totals.skipped > 0 ? `<span class="pill pill--skip">${totals.skipped} skipped</span>` : ""}
    </div>`;

  const rows = suites
    .map((s) => {
      const ok = s.failed === 0 && s.broken === 0;
      const dot = ok ? "dot--pass" : "dot--fail";
      const pills = [
        s.passed > 0 ? `<span class="pill pill--pass">${s.passed}✓</span>` : "",
        s.failed > 0 ? `<span class="pill pill--fail">${s.failed}✗</span>` : "",
        s.broken > 0 ? `<span class="pill pill--broken">${s.broken}!</span>` : "",
        s.skipped > 0 ? `<span class="pill pill--skip">${s.skipped}−</span>` : "",
      ]
        .filter(Boolean)
        .join(" ");
      return `<tr>
          <td><span class="dot ${dot}"></span></td>
          <td class="suite-name">${suiteName(s.name)}</td>
          <td class="suite-pills">${pills}</td>
        </tr>`;
    })
    .join("\n");

  return `${totalBar}
    <table class="suite-table">
      <tbody>
        ${rows}
      </tbody>
    </table>`;
}

/**
 * Builds the HTML string for the dashboard index page.
 * Exported for use in tests.
 */
function buildHtml({ timestamp, lighthouseAvailable, lhUserFlowAvailable, unitData, e2eData, timingData }) {
  const badgesHtml = WORKFLOWS.map(
    ({ file, label }) =>
      `      <a href="${workflowUrl(file)}" target="_blank" rel="noopener noreferrer" data-testid="badge-${file}">
        <img src="${badgeUrl(file)}" alt="${label} status" data-testid="badge-img-${file}" />
      </a>`,
  ).join("\n");

  const unitOk = unitData ? unitData.totals.failed === 0 && unitData.totals.broken === 0 : null;
  const e2eOk  = e2eData  ? e2eData.totals.failed  === 0 && e2eData.totals.broken  === 0 : null;

  const unitPanelClass  = unitOk === null ? "panel" : unitOk  ? "panel panel--pass" : "panel panel--fail";
  const e2ePanelClass   = e2eOk  === null ? "panel" : e2eOk   ? "panel panel--pass" : "panel panel--fail";

  const lighthousePanel = lighthouseAvailable
    ? `    <section class="panel" data-testid="lighthouse-panel">
      <h2>Lighthouse CI</h2>
      <p><a href="./lighthouse/" target="_blank" rel="noopener noreferrer" data-testid="link-lighthouse">Open Lighthouse Report</a></p>
    </section>`
    : `    <section class="panel panel--unavailable" data-testid="lighthouse-panel">
      <h2>Lighthouse CI</h2>
      <p class="unavailable" data-testid="lighthouse-unavailable">Not available — deploy job must succeed to produce this artefact.</p>
    </section>`;

  const lhUserFlowPanel = lhUserFlowAvailable
    ? `    <section class="panel" data-testid="lh-user-flow-panel">
      <h2>Lighthouse User Flow</h2>
      <p><a href="./lighthouse-user-flow/report.html" target="_blank" rel="noopener noreferrer" data-testid="link-lh-user-flow">Open User Flow Report</a></p>
    </section>`
    : `    <section class="panel panel--unavailable" data-testid="lh-user-flow-panel">
      <h2>Lighthouse User Flow</h2>
      <p class="unavailable" data-testid="lh-user-flow-unavailable">Not available — deploy job must succeed to produce this artefact.</p>
    </section>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>card-max CI Dashboard</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; margin: 0; padding: 1.5rem 2rem; background: #0d1117; color: #e6edf3; }
    h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
    h2 { font-size: 1rem; margin: 0 0 0.75rem; }
    .subtitle { color: #8b949e; font-size: 0.875rem; margin-bottom: 2rem; }
    .badges { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 2rem; }
    .panels { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 1rem; }

    /* Panel base */
    .panel {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 8px;
      padding: 1.25rem;
    }
    .panel a { color: #58a6ff; text-decoration: none; font-size: 0.875rem; }
    .panel a:hover { text-decoration: underline; }

    /* Panel states */
    .panel--pass { border-color: #238636; background: #0f2419; }
    .panel--pass h2::before { content: "✓ "; color: #3fb950; }
    .panel--fail { border-color: #da3633; background: #1f1010; }
    .panel--fail h2::before { content: "✗ "; color: #f85149; }
    .panel--unavailable { opacity: 0.55; }
    .unavailable { color: #8b949e; font-size: 0.875rem; margin: 0; }

    /* Total bar */
    .total-bar {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
      padding: 0.5rem 0.75rem;
      border-radius: 6px;
      margin-bottom: 0.75rem;
      font-size: 0.8rem;
    }
    .total-bar--pass { background: #0f2419; border: 1px solid #238636; }
    .total-bar--fail { background: #1f1010; border: 1px solid #da3633; }
    .total-count { font-weight: 600; color: #e6edf3; margin-right: 0.25rem; }

    /* Pills */
    .pill {
      display: inline-block;
      padding: 1px 7px;
      border-radius: 99px;
      font-size: 0.75rem;
      font-weight: 500;
    }
    .pill--pass   { background: #1a4429; color: #3fb950; }
    .pill--fail   { background: #3d0f0f; color: #f85149; }
    .pill--broken { background: #3d2200; color: #d29922; }
    .pill--skip   { background: #21262d; color: #8b949e; }

    /* Suite table */
    .suite-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.78rem;
    }
    .suite-table td { padding: 3px 4px; vertical-align: middle; }
    .suite-table tr:hover td { background: rgba(255,255,255,0.03); }
    .suite-name { color: #c9d1d9; word-break: break-all; }
    .suite-pills { white-space: nowrap; text-align: right; }

    /* Status dot */
    .dot {
      display: inline-block;
      width: 8px; height: 8px;
      border-radius: 50%;
      margin-right: 4px;
    }
    .dot--pass { background: #3fb950; }
    .dot--fail { background: #f85149; }

    /* Report link */
    .report-link { display: block; margin-top: 0.75rem; font-size: 0.8rem; }
  </style>
</head>
<body>
  <h1 data-testid="dashboard-title">card-max CI Dashboard</h1>
  <p class="subtitle" data-testid="dashboard-timestamp">Generated: ${timestamp}</p>

  <section class="badges" data-testid="badges-section">
${badgesHtml}
  </section>

  <div class="panels" data-testid="panels-section">
    <section class="${unitPanelClass}" data-testid="allure-unit-panel">
      <h2>Unit / Component Tests</h2>
      ${suitesTable(unitData)}
      <a class="report-link" href="./allure-unit/index.html" target="_blank" rel="noopener noreferrer" data-testid="link-allure-unit">Open full Allure report →</a>
    </section>

    <section class="${e2ePanelClass}" data-testid="allure-e2e-panel">
      <h2>E2E Tests</h2>
      ${suitesTable(e2eData)}
      <a class="report-link" href="./allure-e2e/index.html" target="_blank" rel="noopener noreferrer" data-testid="link-allure-e2e">Open full Allure report →</a>
    </section>

${lighthousePanel}

${lhUserFlowPanel}

${timingPanel(timingData)}

    <section class="panel" data-testid="cron-health-panel">
      <h2>Cron Job Health</h2>
      <p><a href="./cron-summary.html" target="_blank" rel="noopener noreferrer" data-testid="link-cron-summary">Open Cron Job Health →</a></p>
    </section>
  </div>
</body>
</html>
`;
}

function main() {
  if (!exists(DASHBOARD_DIR)) {
    fs.mkdirSync(DASHBOARD_DIR, { recursive: true });
  }

  // Check for the specific HTML files, not just directory existence.
  // The normalization step in dashboard.yml flattens SHA subdirs before this runs.
  const lighthouseAvailable = exists(path.join(DASHBOARD_DIR, "lighthouse", "index.html"));
  const lhUserFlowAvailable = exists(path.join(DASHBOARD_DIR, "lighthouse-user-flow", "report.html"));

  const unitData = readAllureSuites(path.join(DASHBOARD_DIR, "allure-unit", "data", "suites.json"));
  const e2eData  = readAllureSuites(path.join(DASHBOARD_DIR, "allure-e2e",  "data", "suites.json"));
  // Timing JSON is written to project-root test-results/ by interaction-timing.spec.ts
  const timingData = readTimingResults(
    process.env.TEST_RESULTS_DIR_OVERRIDE || path.join(__dirname, "..", "test-results"),
  );

  const timestamp = new Date().toISOString();

  const html = buildHtml({ timestamp, lighthouseAvailable, lhUserFlowAvailable, unitData, e2eData, timingData });

  const outPath = path.join(DASHBOARD_DIR, "index.html");
  fs.writeFileSync(outPath, html, "utf8");

  console.log(`Dashboard index written to ${outPath}`);
  console.log(`  Unit panel : ${unitData ? `${unitData.totals.total} tests, ${unitData.totals.failed} failed` : "no data"}`);
  console.log(`  E2E panel  : ${e2eData  ? `${e2eData.totals.total}  tests, ${e2eData.totals.failed}  failed` : "no data"}`);
  console.log(`  Lighthouse : ${lighthouseAvailable ? "linked" : "unavailable"}`);
  console.log(`  User-flow  : ${lhUserFlowAvailable ? "linked" : "unavailable"}`);
  console.log(`  Timing     : ${timingData ? `${Object.keys(timingData.results).length} interactions, budget ${timingData.budgetMs}ms` : "no data"}`);
}

module.exports = { buildHtml, readAllureSuites, readTimingResults, timingPanel, suiteName, WORKFLOWS };

if (require.main === module) {
  main();
}
