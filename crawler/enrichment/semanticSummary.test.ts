/**
 * generateSemanticSummary — unit tests
 * Spec: specs/features/044-ai-offer-enrichment.md (AC3, AC4)
 *       specs/features/057-enrichment-multi-provider-llm-strategy.md (AC15)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGenerateText } = vi.hoisted(() => ({ mockGenerateText: vi.fn() }));

vi.mock("./providers/router", () => ({
  generateText: mockGenerateText,
  sharedRouter: {},
}));

import { generateSemanticSummary } from "./semanticSummary";

describe("generateSemanticSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a non-empty summary for a well-formed offer (AC3)", async () => {
    mockGenerateText.mockResolvedValue("20% off dining at Pizza Hut, a great weekday deal.");

    const result = await generateSemanticSummary({
      title: "20% off at Pizza Hut",
      description: "Every weekday",
      merchant: "Pizza Hut",
      category: "dining",
    });

    expect(result).toBe("20% off dining at Pizza Hut, a great weekday deal.");
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
  });

  it("builds a prompt containing the offer's title, merchant, and category (AC15)", async () => {
    mockGenerateText.mockResolvedValue("Summary.");

    await generateSemanticSummary({
      title: "20% off at Pizza Hut",
      description: "Every weekday",
      merchant: "Pizza Hut",
      category: "dining",
    });

    const [, prompt] = mockGenerateText.mock.calls[0] as [unknown, string];
    expect(prompt).toContain("Pizza Hut");
    expect(prompt).toContain("dining");
    expect(prompt).toContain("20% off at Pizza Hut");
  });

  it("returns undefined when the router returns an empty string", async () => {
    mockGenerateText.mockResolvedValue("");

    const result = await generateSemanticSummary({
      title: "Offer",
      merchant: "Merchant",
      category: "other",
    });

    expect(result).toBeUndefined();
  });

  it("propagates errors so the caller can mark enrichment as failed (AC4)", async () => {
    mockGenerateText.mockRejectedValue(new Error("AI provider unavailable"));

    await expect(
      generateSemanticSummary({ title: "Offer", merchant: "Merchant", category: "other" })
    ).rejects.toThrow("AI provider unavailable");
  });
});
