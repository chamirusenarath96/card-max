/**
 * Unit tests for scripts/build-dashboard-index.js
 * Spec: specs/features/025-ci-test-dashboard.md
 *
 * Tests AC5: index.html links to allure-unit, allure-e2e, and contains GitHub Actions badges.
 *
 * @vitest-environment node
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCRIPT = path.join(__dirname, "build-dashboard-index.js");

function runScript(tmpDir: string, extraEnv: Record<string, string> = {}): void {
  execFileSync(process.execPath, [SCRIPT], {
    env: { ...process.env, DASHBOARD_DIR_OVERRIDE: tmpDir, ...extraEnv },
    stdio: "pipe",
  });
}

describe("build-dashboard-index (Feature 025 — AC5)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("index.html contains link to allure-unit report", () => {
    runScript(tmpDir);
    const html = fs.readFileSync(path.join(tmpDir, "index.html"), "utf8");
    expect(html).toContain("./allure-unit/index.html");
    expect(html).toContain('data-testid="link-allure-unit"');
  });

  it("index.html contains link to allure-e2e report", () => {
    runScript(tmpDir);
    const html = fs.readFileSync(path.join(tmpDir, "index.html"), "utf8");
    expect(html).toContain("./allure-e2e/index.html");
    expect(html).toContain('data-testid="link-allure-e2e"');
  });

  it("index.html contains GitHub Actions badge <img> tags", () => {
    runScript(tmpDir);
    const html = fs.readFileSync(path.join(tmpDir, "index.html"), "utf8");
    expect(html).toContain(
      "https://github.com/chamirusenarath96/card-max/actions/workflows/ci.yml/badge.svg",
    );
    expect(html).toContain("<img");
    expect(html).toContain('data-testid="badge-img-ci.yml"');
  });

  it("index.html shows lighthouse-unavailable placeholder when no lighthouse dir", () => {
    runScript(tmpDir);
    const html = fs.readFileSync(path.join(tmpDir, "index.html"), "utf8");
    expect(html).toContain('data-testid="lighthouse-unavailable"');
    expect(html).not.toContain('data-testid="link-lighthouse"');
  });

  it("index.html links to lighthouse when lighthouse dir present", () => {
    // Create lighthouse directory to simulate artefact download
    fs.mkdirSync(path.join(tmpDir, "lighthouse"));
    runScript(tmpDir);
    const html = fs.readFileSync(path.join(tmpDir, "index.html"), "utf8");
    expect(html).toContain('data-testid="link-lighthouse"');
    expect(html).toContain("./lighthouse/");
    expect(html).not.toContain('data-testid="lighthouse-unavailable"');
  });

  it("index.html contains dashboard-title and dashboard-timestamp testids", () => {
    runScript(tmpDir);
    const html = fs.readFileSync(path.join(tmpDir, "index.html"), "utf8");
    expect(html).toContain('data-testid="dashboard-title"');
    expect(html).toContain('data-testid="dashboard-timestamp"');
    expect(html).toContain("card-max CI Dashboard");
  });

  it("index.html contains link to cron-summary.html (spec 028 — AC4)", () => {
    runScript(tmpDir);
    const html = fs.readFileSync(path.join(tmpDir, "index.html"), "utf8");
    expect(html).toContain("cron-summary.html");
    expect(html).toContain('data-testid="link-cron-summary"');
  });

  // ── spec 029 — AC9: Lighthouse user-flow panel ─────────────────────────────

  it("index.html shows lh-user-flow-unavailable placeholder when no user-flow dir", () => {
    runScript(tmpDir);
    const html = fs.readFileSync(path.join(tmpDir, "index.html"), "utf8");
    expect(html).toContain('data-testid="lh-user-flow-unavailable"');
    expect(html).not.toContain('data-testid="link-lh-user-flow"');
  });

  it("index.html links to user-flow report when lighthouse-user-flow dir present", () => {
    fs.mkdirSync(path.join(tmpDir, "lighthouse-user-flow"));
    runScript(tmpDir);
    const html = fs.readFileSync(path.join(tmpDir, "index.html"), "utf8");
    expect(html).toContain('data-testid="link-lh-user-flow"');
    expect(html).toContain("./lighthouse-user-flow/report.html");
    expect(html).not.toContain('data-testid="lh-user-flow-unavailable"');
  });

  it("index.html always contains lh-user-flow-panel testid", () => {
    runScript(tmpDir);
    const html = fs.readFileSync(path.join(tmpDir, "index.html"), "utf8");
    expect(html).toContain('data-testid="lh-user-flow-panel"');
  });
});
