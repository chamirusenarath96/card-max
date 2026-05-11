/**
 * Generates dashboard/index.html linking all CI report panels.
 *
 * Panels:
 *   - Allure unit test report  → ./allure-unit/index.html
 *   - Allure E2E report        → ./allure-e2e/index.html
 *   - Lighthouse CI report     → ./lighthouse/ (may be absent)
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
 * Builds the HTML string for the dashboard index page.
 * Exported for use in tests.
 */
function buildHtml({ timestamp, lighthouseAvailable }) {
  const badgesHtml = WORKFLOWS.map(
    ({ file, label }) =>
      `      <a href="${workflowUrl(file)}" target="_blank" rel="noopener noreferrer" data-testid="badge-${file}">
        <img src="${badgeUrl(file)}" alt="${label} status" data-testid="badge-img-${file}" />
      </a>`,
  ).join("\n");

  const lighthousePanel = lighthouseAvailable
    ? `    <section class="panel" data-testid="lighthouse-panel">
      <h2>Lighthouse CI</h2>
      <p><a href="./lighthouse/" target="_blank" rel="noopener noreferrer" data-testid="link-lighthouse">Open Lighthouse Report</a></p>
    </section>`
    : `    <section class="panel panel--unavailable" data-testid="lighthouse-panel">
      <h2>Lighthouse CI</h2>
      <p class="unavailable" data-testid="lighthouse-unavailable">Not available — no Lighthouse artefact found for this run.</p>
    </section>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>card-max CI Dashboard</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; padding: 1.5rem 2rem; background: #0d1117; color: #e6edf3; }
    h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
    .subtitle { color: #8b949e; font-size: 0.875rem; margin-bottom: 2rem; }
    .badges { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 2rem; }
    .panels { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 1rem; }
    .panel { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 1.25rem; }
    .panel h2 { font-size: 1rem; margin: 0 0 0.75rem; }
    .panel a { color: #58a6ff; text-decoration: none; }
    .panel a:hover { text-decoration: underline; }
    .panel--unavailable { opacity: 0.6; }
    .unavailable { color: #8b949e; font-size: 0.875rem; }
  </style>
</head>
<body>
  <h1 data-testid="dashboard-title">card-max CI Dashboard</h1>
  <p class="subtitle" data-testid="dashboard-timestamp">Generated: ${timestamp}</p>

  <section class="badges" data-testid="badges-section">
${badgesHtml}
  </section>

  <div class="panels" data-testid="panels-section">
    <section class="panel" data-testid="allure-unit-panel">
      <h2>Unit / Component Tests</h2>
      <p><a href="./allure-unit/index.html" target="_blank" rel="noopener noreferrer" data-testid="link-allure-unit">Open Allure Unit Report</a></p>
    </section>

    <section class="panel" data-testid="allure-e2e-panel">
      <h2>E2E Tests</h2>
      <p><a href="./allure-e2e/index.html" target="_blank" rel="noopener noreferrer" data-testid="link-allure-e2e">Open Allure E2E Report</a></p>
    </section>

${lighthousePanel}
  </div>
</body>
</html>
`;
}

function main() {
  if (!exists(DASHBOARD_DIR)) {
    fs.mkdirSync(DASHBOARD_DIR, { recursive: true });
  }

  const lighthouseAvailable = exists(path.join(DASHBOARD_DIR, "lighthouse"));
  const timestamp = new Date().toISOString();

  const html = buildHtml({ timestamp, lighthouseAvailable });

  const outPath = path.join(DASHBOARD_DIR, "index.html");
  fs.writeFileSync(outPath, html, "utf8");

  console.log(`Dashboard index written to ${outPath}`);
  console.log(
    `  Lighthouse panel: ${lighthouseAvailable ? "linked" : "unavailable placeholder"}`,
  );
}

module.exports = { buildHtml, WORKFLOWS };

if (require.main === module) {
  main();
}
