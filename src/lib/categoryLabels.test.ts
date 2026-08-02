/**
 * Unit tests for CATEGORY_LABELS and the consolidated CategorySchema enum.
 * Spec: specs/features/048-consolidate-offer-categories.md (AC2, AC6)
 */
import { describe, it, expect } from "vitest";
import { CategorySchema } from "../../specs/data/offer.schema";
import { CATEGORY_LABELS } from "./categoryLabels";

describe("CategorySchema (spec 048 consolidation)", () => {
  it("no longer contains the merged/removed categories", () => {
    expect(CategorySchema.options).not.toContain("lodging");
    expect(CategorySchema.options).not.toContain("clothing");
  });

  it("only contains the consolidated category set", () => {
    expect([...CategorySchema.options].sort()).toEqual(
      [
        "dining",
        "shopping",
        "travel",
        "homecare",
        "fuel",
        "groceries",
        "entertainment",
        "wellness",
        "healthcare",
        "installments",
        "online",
        "other",
      ].sort(),
    );
  });

  it("retains wellness and healthcare as distinct values (not merged)", () => {
    expect(CategorySchema.options).toContain("wellness");
    expect(CategorySchema.options).toContain("healthcare");
  });
});

describe("CATEGORY_LABELS", () => {
  it("has exactly one label per CategorySchema value — no extra, no missing", () => {
    const schemaValues = [...CategorySchema.options].sort();
    const labelKeys = Object.keys(CATEGORY_LABELS).sort();
    expect(labelKeys).toEqual(schemaValues);
  });

  it("has no stale entries for the removed categories", () => {
    expect(CATEGORY_LABELS).not.toHaveProperty("lodging");
    expect(CATEGORY_LABELS).not.toHaveProperty("clothing");
  });
});
