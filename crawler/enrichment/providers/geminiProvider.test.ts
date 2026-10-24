/**
 * Gemini LLM provider — unit tests
 * Spec: specs/features/057-enrichment-multi-provider-llm-strategy.md (AC12)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiError } from "@google/genai";

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

vi.mock("../geminiClient", () => ({
  getGeminiClient: () => ({ models: { generateContent: mockCreate } }),
  ENRICHMENT_MODEL: "gemini-flash-latest",
}));

import { createGeminiProvider } from "./geminiProvider";
import { ProviderRateLimitError } from "./types";

describe("createGeminiProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("declares gemini's static config", () => {
    const provider = createGeminiProvider("key");
    expect(provider.name).toBe("gemini");
    expect(provider.supportsVision).toBe(true);
  });

  describe("generateText", () => {
    it("returns the trimmed response text, omitting thinkingConfig and giving maxOutputTokens headroom (#116, #119)", async () => {
      mockCreate.mockResolvedValue({ text: "  Summary.  " });
      const provider = createGeminiProvider("key");

      const result = await provider.generateText("prompt");

      expect(result).toBe("Summary.");
      const [[call]] = mockCreate.mock.calls;
      expect(call.config.thinkingConfig).toBeUndefined();
      expect(call.config.maxOutputTokens).toBeGreaterThanOrEqual(1024);
    });

    it("returns an empty string when the response has no text", async () => {
      mockCreate.mockResolvedValue({ text: undefined });
      const provider = createGeminiProvider("key");
      expect(await provider.generateText("prompt")).toBe("");
    });

    it("throws ProviderRateLimitError with retryAfterMs parsed from error.details[].retryDelay on 429 (AC12)", async () => {
      const apiError = new ApiError({
        status: 429,
        message: JSON.stringify({
          error: {
            code: 429,
            details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "12s" }],
          },
        }),
      });
      mockCreate.mockRejectedValue(apiError);
      const provider = createGeminiProvider("key");

      const err = await provider.generateText("prompt").catch((e) => e);

      expect(err).toBeInstanceOf(ProviderRateLimitError);
      expect((err as ProviderRateLimitError).retryAfterMs).toBe(12_000);
    });

    it("falls back to a 15000ms cooldown when retryDelay is absent from a 429 error body (AC12)", async () => {
      const apiError = new ApiError({
        status: 429,
        message: JSON.stringify({ error: { code: 429, details: [] } }),
      });
      mockCreate.mockRejectedValue(apiError);
      const provider = createGeminiProvider("key");

      const err = await provider.generateText("prompt").catch((e) => e);

      expect(err).toBeInstanceOf(ProviderRateLimitError);
      expect((err as ProviderRateLimitError).retryAfterMs).toBe(15_000);
    });

    it("falls back to a 15000ms cooldown when the 429 body is malformed", async () => {
      const apiError = new ApiError({ status: 429, message: "not json" });
      mockCreate.mockRejectedValue(apiError);
      const provider = createGeminiProvider("key");

      const err = await provider.generateText("prompt").catch((e) => e);

      expect((err as ProviderRateLimitError).retryAfterMs).toBe(15_000);
    });

    it("propagates a non-429 error unchanged", async () => {
      mockCreate.mockRejectedValue(new Error("boom"));
      const provider = createGeminiProvider("key");

      await expect(provider.generateText("prompt")).rejects.toThrow("boom");
    });
  });

  describe("generateFromImage", () => {
    it("returns the trimmed response text for a vision call", async () => {
      mockCreate.mockResolvedValue({ text: "Valid every Thursday." });
      const provider = createGeminiProvider("key");

      const result = await provider.generateFromImage(
        { data: "base64data", mediaType: "image/jpeg" },
        "Extract conditions"
      );

      expect(result).toBe("Valid every Thursday.");
    });

    it("throws ProviderRateLimitError on a 429 vision error", async () => {
      const apiError = new ApiError({
        status: 429,
        message: JSON.stringify({ error: { details: [{ retryDelay: "5s" }] } }),
      });
      mockCreate.mockRejectedValue(apiError);
      const provider = createGeminiProvider("key");

      const err = await provider
        .generateFromImage({ data: "x", mediaType: "image/png" }, "prompt")
        .catch((e) => e);

      expect(err).toBeInstanceOf(ProviderRateLimitError);
      expect((err as ProviderRateLimitError).retryAfterMs).toBe(5_000);
    });
  });
});
