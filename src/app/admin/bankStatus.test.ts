/**
 * Spec: specs/features/082-crawler-run-history.md (TC7)
 */
import { describe, it, expect } from "vitest";
import { bankStatusPipeline } from "./bankStatus";

describe("bankStatusPipeline", () => {
  it("counts only non-expired offers but takes lastScraped over all offers", () => {
    const group = bankStatusPipeline()[0] as { $group: Record<string, unknown> };
    expect(group.$group.count).toEqual({ $sum: { $cond: [{ $eq: ["$isExpired", false] }, 1, 0] } });
    expect(group.$group.lastScraped).toEqual({ $max: "$scrapedAt" });
    // No $match stage — expired-only banks must still report lastScraped
    expect(bankStatusPipeline().some((stage) => "$match" in stage)).toBe(false);
  });
});
