/**
 * fetch-cron-summary.js — Fetch last 5 scheduled runs per workflow and write
 * dashboard/cron-summary.html.
 *
 * Run:  node scripts/fetch-cron-summary.js
 * Env:
 *   GITHUB_TOKEN          — GitHub personal access token (actions:read)
 *   GITHUB_API_BASE       — override API base URL (default: https://api.github.com); used in tests
 *   DASHBOARD_DIR_OVERRIDE — override output directory (default: <repo root>/dashboard); used in tests
 *
 * Spec: specs/features/028-cron-job-summary.md
 */

const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");

const REPO_OWNER = "chamirusenarath96";
const REPO_NAME = "card-max";

const WORKFLOWS = [
  { id: "crawler.yml", label: "Daily Crawler" },
  { id: "atlas-warmup.yml", label: "Atlas Warmup" },
  { id: "dashboard.yml", label: "CI Dashboard" },
  { id: "card-max-spec-writer", label: "Spec Writer (scheduled task)" },
  { id: "card-max-implementer", label: "Implementer (scheduled task)" },
];

const DASHBOARD_DIR =
  process.env.DASHBOARD_DIR_OVERRIDE ||
  path.join(__dirname, "..", "dashboard");

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escAttr(str) {
  return String(str).replace(/"/g, "&quot;");
}

function formatDateUtc(dateStr) {
  const d = new Date(dateStr);
  return d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

/**
 * Build the full cron-summary.html string from an array of workflow row objects.
 * Each element: { label, runs, error? }
 *   runs  — array of GitHub workflow run objects (id, created_at, conclusion, html_url)
 *   error — "not-github-actions" | "fetch-error" | "no-token" (optional)
 */
function buildHtmlTable(workflowRows) {
  const rowsHtml = workflowRows.flatMap(({ label, runs, error }) => {
    if (error === "not-github-actions") {
      return [
        `    <tr>
      <td>${escHtml(label)}</td>
      <td colspan="4" class="note">Not a GitHub Actions workflow — see scheduled task definition</td>
    </tr>`,
      ];
    }
    if (!runs || runs.length === 0) {
      return [
        `    <tr>
      <td>${escHtml(label)}</td>
      <td colspan="4" class="note">No runs yet</td>
    </tr>`,
      ];
    }
    return runs.map(
      (run) =>
        `    <tr>
      <td>${escHtml(label)}</td>
      <td>${run.id}</td>
      <td>${formatDateUtc(run.created_at)}</td>
      <td class="${run.conclusion === "success" ? "success" : "failure"}">${
        run.conclusion === "success"
          ? "✅ success"
          : `❌ ${escHtml(run.conclusion || "unknown")}`
      }</td>
      <td><a href="${escAttr(run.html_url)}">View log</a></td>
    </tr>`,
    );
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Cron Job Health — card-max CI Dashboard</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; padding: 1.5rem 2rem; background: #0d1117; color: #e6edf3; }
    h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
    .subtitle { color: #8b949e; font-size: 0.875rem; margin-bottom: 2rem; }
    a { color: #58a6ff; text-decoration: none; }
    a:hover { text-decoration: underline; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 0.5rem 0.75rem; text-align: left; border-bottom: 1px solid #30363d; font-size: 0.875rem; }
    th { background: #161b22; font-weight: 600; }
    .success { color: #3fb950; }
    .failure { color: #f85149; }
    .note { color: #8b949e; font-style: italic; }
  </style>
</head>
<body>
  <h1 data-testid="cron-summary-title">Cron Job Health</h1>
  <p class="subtitle" data-testid="cron-summary-back"><a href="./index.html">← Back to Dashboard</a></p>
  <table data-testid="cron-summary-table">
    <thead>
      <tr>
        <th>Workflow</th>
        <th>Run #</th>
        <th>Triggered (UTC)</th>
        <th>Status</th>
        <th>Log</th>
      </tr>
    </thead>
    <tbody data-testid="cron-summary-tbody">
${rowsHtml.join("\n")}
    </tbody>
  </table>
</body>
</html>
`;
}

function httpGet(url, headers) {
  const lib = url.startsWith("https:") ? https : http;
  return new Promise((resolve, reject) => {
    lib
      .get(url, { headers, agent: false }, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => resolve({ status: res.statusCode, body: data }));
      })
      .on("error", reject);
  });
}

async function fetchRuns(workflow) {
  const { id, label } = workflow;
  const token = process.env.GITHUB_TOKEN;
  const apiBase =
    process.env.GITHUB_API_BASE || "https://api.github.com";
  const url = `${apiBase}/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/${id}/runs?per_page=5&event=schedule`;

  const { status, body } = await httpGet(url, {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "card-max-dashboard",
    "X-GitHub-Api-Version": "2022-11-28",
  });

  if (status === 404) {
    console.warn(
      `[cron-summary] workflow not found: ${id} — rendering placeholder`,
    );
    return { label, runs: [], error: "not-github-actions" };
  }

  if (status !== 200) {
    throw new Error(
      `GitHub API returned HTTP ${status} for workflow "${id}"`,
    );
  }

  const data = JSON.parse(body);
  return { label, runs: data.workflow_runs || [] };
}

async function main() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.warn("[cron-summary] GITHUB_TOKEN not set — writing placeholder");
    fs.mkdirSync(DASHBOARD_DIR, { recursive: true });
    const html = buildHtmlTable(
      WORKFLOWS.map(({ label }) => ({ label, runs: [], error: "no-token" })),
    );
    fs.writeFileSync(path.join(DASHBOARD_DIR, "cron-summary.html"), html, "utf8");
    return;
  }

  const results = await Promise.allSettled(WORKFLOWS.map(fetchRuns));
  let hasError = false;

  const rows = results.map((r, i) => {
    if (r.status === "rejected") {
      console.error(
        `[cron-summary] failed to fetch ${WORKFLOWS[i].id}: ${r.reason}`,
      );
      hasError = true;
      return { label: WORKFLOWS[i].label, runs: [], error: "fetch-error" };
    }
    return r.value;
  });

  const html = buildHtmlTable(rows);
  fs.mkdirSync(DASHBOARD_DIR, { recursive: true });
  fs.writeFileSync(path.join(DASHBOARD_DIR, "cron-summary.html"), html, "utf8");
  console.log("[cron-summary] wrote dashboard/cron-summary.html");

  if (hasError) {
    process.exit(1);
  }
}

module.exports = { buildHtmlTable, WORKFLOWS, escHtml, formatDateUtc };

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
