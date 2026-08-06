/**
 * generateSemanticSummary — unit tests
 * Spec: specs/features/044-ai-offer-enrichment.md (AC3, AC4)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

vi.mock("./geminiClient", () => ({
  getGeminiClient: () => ({ models: { generateContent: mockCreate } }),
  ENRICHMENT_MODEL: "gemini-flash-latest",
}));

import { generateSemanticSummary } from "./semanticSummary";

describe("generateSemanticSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a non-empty summary for a well-formed offer (AC3)", async () => {
    mockCreate.mockResolvedValue({
      text: "20% off dining at Pizza Hut, a great weekday deal.",
    });

    const result = await generateSemanticSummary({
      title: "20% off at Pizza Hut",
      description: "Every weekday",
      merchant: "Pizza Hut",
      category: "dining",
    });

    expect(result).toBe("20% off dining at Pizza Hut, a great weekday deal.");
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("disables thinking so the token budget isn't consumed by reasoning (#116)", async () => {
    mockCreate.mockResolvedValue({ text: "Summary." });

    await generateSemanticSummary({ title: "Offer", merchant: "Merchant", category: "other" });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({ thinkingConfig: { thinkingBudget: 0 } }),
      })
    );
  });

  it("returns undefined when the response has no text content", async () => {
    mockCreate.mockResolvedValue({ text: undefined });

    const result = await generateSemanticSummary({
      title: "Offer",
      merchant: "Merchant",
      category: "other",
    });

    expect(result).toBeUndefined();
  });

  it("propagates errors so the caller can mark enrichment as failed (AC4)", async () => {
    mockCreate.mockRejectedValue(new Error("AI provider unavailable"));

    await expect(
      generateSemanticSummary({ title: "Offer", merchant: "Merchant", category: "other" })
    ).rejects.toThrow("AI provider unavailable");
  });
});
