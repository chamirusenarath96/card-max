/**
 * Unit tests for scripts/fetch-cron-summary.js
 * Spec: specs/features/028-cron-job-summary.md
 *
 * Coverage:
 *   AC1+AC2 — script writes cron-summary.html
 *   AC3     — HTML contains all 5 workflow names and github.com links
 *   AC5     — build-dashboard job has actions:read permission (checked separately in dashboard.yml test)
 *   AC6     — script exits 1 on non-200 (non-404) API response
 *
 * @vitest-environment node
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCRIPT = path.join(__dirname, "fetch-cron-summary.js");
const req = createRequire(import.meta.url);
const { buildHtmlTable, WORKFLOWS } = req("./fetch-cron-summary.js");

const MOCK_RUNS = [
  {
    id: 12345,
    created_at: "2026-05-12T02:00:00Z",
    conclusion: "success",
    html_url: "https://github.com/chamirusenarath96/card-max/actions/runs/12345",
  },
  {
    id: 12344,
    created_at: "2026-05-11T02:00:00Z",
    conclusion: "failure",
    html_url: "https://github.com/chamirusenarath96/card-max/actions/runs/12344",
  },
];

// ---------------------------------------------------------------------------
// Pure function tests — buildHtmlTable
// ---------------------------------------------------------------------------

describe("buildHtmlTable", () => {
  it("contains all 5 workflow labels", () => {
    const rows = WORKFLOWS.map((w: { id: string; label: string }) => ({
      label: w.label,
      runs: MOCK_RUNS,
    }));
    const html = buildHtmlTable(rows);

    expect(html).toContain("Daily Crawler");
    expect(html).toContain("Atlas Warmup");
    expect(html).toContain("CI Dashboard");
    expect(html).toContain("Spec Writer (scheduled task)");
    expect(html).toContain("Implementer (scheduled task)");
  });

  it("contains <a href> links pointing to github.com for each run", () => {
    const rows = WORKFLOWS.map((w: { id: string; label: string }) => ({
      label: w.label,
      runs: MOCK_RUNS,
    }));
    const html = buildHtmlTable(rows);

    expect(html).toContain("https://github.com/chamirusenarath96/card-max/actions/runs/12345");
    expect(html).toContain("https://github.com/chamirusenarath96/card-max/actions/runs/12344");
    expect(html).toContain("<a href=");
    expect(html).toContain("View log");
  });

  it("shows '✅ success' for successful runs and '❌ failure' for failed runs", () => {
    const rows = [{ label: "Daily Crawler", runs: MOCK_RUNS }];
    const html = buildHtmlTable(rows);
    expect(html).toContain("✅ success");
    expect(html).toContain("❌ failure");
  });

  it("shows 'No runs yet' placeholder when runs array is empty", () => {
    const rows = [{ label: "Daily Crawler", runs: [] }];
    const html = buildHtmlTable(rows);
    expect(html).toContain("No runs yet");
  });

  it("shows 'Not a GitHub Actions workflow' for not-github-actions error", () => {
    const rows = [
      { label: "Spec Writer (scheduled task)", runs: [], error: "not-github-actions" },
    ];
    const html = buildHtmlTable(rows);
    expect(html).toContain("Not a GitHub Actions workflow");
  });

  it("includes data-testid attributes for table elements", () => {
    const rows = [{ label: "Daily Crawler", runs: MOCK_RUNS }];
    const html = buildHtmlTable(rows);
    expect(html).toContain('data-testid="cron-summary-title"');
    expect(html).toContain('data-testid="cron-summary-table"');
    expect(html).toContain('data-testid="cron-summary-tbody"');
  });

  it("formats trigger time in UTC", () => {
    const rows = [{ label: "Daily Crawler", runs: [MOCK_RUNS[0]] }];
    const html = buildHtmlTable(rows);
    expect(html).toContain("2026-05-12 02:00 UTC");
  });
});

// ---------------------------------------------------------------------------
// CI lint test — dashboard.yml has actions: read permission (AC5)
// ---------------------------------------------------------------------------

describe("dashboard.yml permissions (AC5)", () => {
  it("build-dashboard job has actions: read permission", () => {
    const workflowPath = path.join(
      __dirname,
      "..",
      ".github",
      "workflows",
      "dashboard.yml",
    );
    const yaml = fs.readFileSync(workflowPath, "utf8");
    expect(yaml).toContain("actions: read");
  });
});

// ---------------------------------------------------------------------------
// Integration tests — script file I/O via a local mock HTTP server
//
// Uses async spawn (not spawnSync) because spawnSync blocks the Node.js event
// loop, preventing the mock server in the same process from handling requests.
// ---------------------------------------------------------------------------

function startMockServer(handler: http.RequestListener): Promise<http.Server> {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function getServerPort(server: http.Server): number {
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("unexpected address");
  return addr.port;
}

function stopServer(server: http.Server): Promise<void> {
  return new Promise((resolve) => {
    server.closeAllConnections();
    server.close(() => resolve());
  });
}

function runScriptAsync(
  tmpDir: string,
  apiBase: string,
): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SCRIPT], {
      env: {
        ...process.env,
        DASHBOARD_DIR_OVERRIDE: tmpDir,
        GITHUB_TOKEN: "test-token",
        GITHUB_API_BASE: apiBase,
      },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    child.on("close", (code) => resolve({ status: code, stdout, stderr }));
  });
}

describe("fetch-cron-summary.js file output (AC1, AC2)", () => {
  let tmpDir: string;
  let server: http.Server | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cron-summary-test-"));
    server = undefined;
  });

  afterEach(async () => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (server) await stopServer(server);
  });

  it("writes cron-summary.html to the dashboard directory", async () => {
    server = await startMockServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ workflow_runs: MOCK_RUNS }));
    });

    const port = getServerPort(server);
    const result = await runScriptAsync(tmpDir, `http://127.0.0.1:${port}`);

    expect(result.status).toBe(0);
    const outFile = path.join(tmpDir, "cron-summary.html");
    expect(fs.existsSync(outFile)).toBe(true);

    const html = fs.readFileSync(outFile, "utf8");
    expect(html).toContain("Daily Crawler");
    expect(html).toContain("Atlas Warmup");
  }, 15000);

  it("exits with code 1 when GitHub API returns non-200 non-404 status", async () => {
    server = await startMockServer((_req, res) => {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "Internal Server Error" }));
    });

    const port = getServerPort(server);
    const result = await runScriptAsync(tmpDir, `http://127.0.0.1:${port}`);

    expect(result.status).toBe(1);
  }, 15000);

  it("does not exit 1 when a workflow returns 404 (not-github-actions path)", async () => {
    server = await startMockServer((_req, res) => {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "Not Found" }));
    });

    const port = getServerPort(server);
    const result = await runScriptAsync(tmpDir, `http://127.0.0.1:${port}`);

    // 404 for all workflows → placeholder rows, script succeeds
    expect(result.status).toBe(0);
    const html = fs.readFileSync(path.join(tmpDir, "cron-summary.html"), "utf8");
    expect(html).toContain("Not a GitHub Actions workflow");
  }, 15000);
});
