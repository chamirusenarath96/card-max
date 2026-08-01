/**
 * resolveApplicableDates — unit tests
 * Spec: specs/features/044-ai-offer-enrichment.md (AC1, AC2, Edge Cases)
 */
import { describe, it, expect } from "vitest";
import { resolveApplicableDates } from "./resolveApplicableDates";

describe("resolveApplicableDates", () => {
  it("resolves 'every Thursday from 1st to 21st of August' to the matching Thursdays (AC1)", () => {
    const result = resolveApplicableDates(
      "Offer applicable every Thursday from 1st to 21st of August 2026 only.",
      new Date(2026, 0, 1),
      new Date(2026, 11, 31)
    );

    expect(result).toEqual(["2026-08-06", "2026-08-13", "2026-08-20"]);
  });

  it("clamps a date range that starts before validFrom to the outer window", () => {
    const result = resolveApplicableDates(
      "Every Thursday from 1st to 21st of August 2026 only.",
      new Date(2026, 7, 10), // Aug 10 — after the 1st
      new Date(2026, 11, 31)
    );

    expect(result).toEqual(["2026-08-13", "2026-08-20"]);
  });

  it("returns undefined when conditions text has no day-of-week/date-range pattern (AC2)", () => {
    const result = resolveApplicableDates(
      "Standard terms and conditions apply.",
      new Date(2026, 0, 1),
      new Date(2026, 11, 31)
    );

    expect(result).toBeUndefined();
  });

  it("returns undefined when conditions text is empty/undefined", () => {
    expect(resolveApplicableDates(undefined, new Date(), new Date())).toBeUndefined();
    expect(resolveApplicableDates("   ", new Date(), new Date())).toBeUndefined();
  });

  it("resolves 'weekends only' against the full outer window when no explicit date range is given", () => {
    const result = resolveApplicableDates(
      "Valid on weekends only.",
      new Date(2026, 7, 1),
      new Date(2026, 7, 9)
    );

    // Aug 1 2026 = Sat, Aug 2 = Sun, Aug 8 = Sat, Aug 9 = Sun
    expect(result).toEqual(["2026-08-01", "2026-08-02", "2026-08-08", "2026-08-09"]);
  });

  it("handles 'Sat & Sun only' phrasing the same as 'weekends' (differing bank phrasing)", () => {
    const result = resolveApplicableDates(
      "Applicable Sat & Sun only.",
      new Date(2026, 7, 1),
      new Date(2026, 7, 2)
    );

    expect(result).toEqual(["2026-08-01", "2026-08-02"]);
  });

  it("fails open on self-contradictory conditions text (except vs only, same weekday)", () => {
    const result = resolveApplicableDates(
      "Valid every day except Thursdays, applicable only on Thursdays.",
      new Date(2026, 7, 1),
      new Date(2026, 7, 31)
    );

    expect(result).toBeUndefined();
  });

  it("returns undefined when the outer validity window is missing entirely", () => {
    expect(
      resolveApplicableDates("Every Thursday from 1st to 21st of August.", undefined, undefined)
    ).toBeUndefined();
  });

  it("returns undefined when validUntil is before validFrom", () => {
    const result = resolveApplicableDates(
      "Every Thursday.",
      new Date(2026, 7, 21),
      new Date(2026, 7, 1)
    );

    expect(result).toBeUndefined();
  });

  it("returns undefined when the resolved range yields no matching weekday occurrences", () => {
    const result = resolveApplicableDates(
      "Every Thursday from 1st to 2nd of August 2026.", // Aug 1-2 2026 is Sat/Sun, no Thursday
      new Date(2026, 0, 1),
      new Date(2026, 11, 31)
    );

    expect(result).toBeUndefined();
  });
});
