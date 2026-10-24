/**
 * crawler.yml failure issue body enrichment — unit tests
 * Spec: specs/features/063-crawler-daily-scrape-failure-2026-08-05.md (AC3)
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("crawler workflow failure issue body", () => {
  it("includes per-bank summaries section in Notify on failure step (AC3)", async () => {
    const workflowPath = path.join(process.cwd(), ".github/workflows/crawler.yml");
    const content = fs.readFileSync(workflowPath, "utf-8");
    expect(content).toContain("Per-bank summaries");
    expect(content).toContain("crawler-summary.json");
    expect(content).toContain("summarySection");
    expect(content).toContain("bank | status | scraped");
  });
});
