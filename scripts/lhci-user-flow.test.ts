/**
 * Unit tests for scripts/lhci-user-flow.js
 * Spec: specs/features/029-ui-interaction-performance-budgets.md
 *
 * Tests AC5 (script exists), AC6 (exits non-zero when INP exceeds budget).
 * The browser flow itself is integration-only (requires lighthouse + a running URL).
 * These tests cover the pure checkInpBudgets logic.
 *
 * @vitest-environment node
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import the pure exports only — does NOT trigger the browser flow
// because require.main === module guard prevents it
import { checkInpBudgets, INP_BUDGET_MS } from "./lhci-user-flow.js";

// ── AC5: script file exists ────────────────────────────────────────────────

describe("lhci-user-flow.js (spec 029 — AC5, AC6)", () => {
  it("script file exists at scripts/lhci-user-flow.js", () => {
    const scriptPath = path.join(__dirname, "lhci-user-flow.js");
    expect(fs.existsSync(scriptPath)).toBe(true);
  });

  it("exports INP_BUDGET_MS constant of 200", () => {
    expect(INP_BUDGET_MS).toBe(200);
  });
});

// ── AC6: INP budget enforcement logic ─────────────────────────────────────

describe("checkInpBudgets", () => {
  function makeStep(name: string, inp: number | undefined) {
    return {
      name,
      lhr: {
        audits: {
          "interaction-to-next-paint": inp !== undefined ? { numericValue: inp } : {},
        } as Record<string, { numericValue?: number }>,
      },
    };
  }

  it("passes when all step INP values are within budget", () => {
    const result = checkInpBudgets({
      steps: [
        makeStep("Apply People's Bank filter", 100),
        makeStep("Apply Dining category filter", 150),
        makeStep("Clear all filters", 80),
      ],
    });
    expect(result.passed).toBe(true);
    expect(result.failedSteps).toHaveLength(0);
  });

  it("fails and returns failed steps when any INP exceeds 200 ms (AC6)", () => {
    const result = checkInpBudgets({
      steps: [
        makeStep("Apply People's Bank filter", 100),
        makeStep("Apply Dining category filter", 250), // exceeds budget
        makeStep("Clear all filters", 80),
      ],
    });
    expect(result.passed).toBe(false);
    expect(result.failedSteps).toHaveLength(1);
    expect(result.failedSteps[0].name).toBe("Apply Dining category filter");
    expect(result.failedSteps[0].inp).toBe(250);
  });

  it("fails when multiple steps exceed budget", () => {
    const result = checkInpBudgets({
      steps: [
        makeStep("Apply People's Bank filter", 300),
        makeStep("Apply Dining category filter", 250),
        makeStep("Clear all filters", 80),
      ],
    });
    expect(result.passed).toBe(false);
    expect(result.failedSteps).toHaveLength(2);
  });

  it("passes when INP is exactly at the budget boundary (200 ms)", () => {
    const result = checkInpBudgets({
      steps: [makeStep("Apply People's Bank filter", 200)],
    });
    // 200 is NOT greater than 200, so it passes
    expect(result.passed).toBe(true);
  });

  it("ignores steps where INP audit is missing (no numericValue)", () => {
    const result = checkInpBudgets({
      steps: [makeStep("Apply People's Bank filter", undefined)],
    });
    // Missing INP is not a failure (may not be available in all LH versions)
    expect(result.passed).toBe(true);
    expect(result.failedSteps).toHaveLength(0);
  });

  it("handles empty steps array", () => {
    const result = checkInpBudgets({ steps: [] });
    expect(result.passed).toBe(true);
    expect(result.failedSteps).toHaveLength(0);
  });
});
