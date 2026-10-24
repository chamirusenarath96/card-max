/**
 * Gemini LLM provider — wraps the existing getGeminiClient()/ENRICHMENT_MODEL
 * from geminiClient.ts (unchanged) behind the LLMProvider interface, and
 * consolidates the API-call shaping (maxOutputTokens headroom, no
 * thinkingConfig — see #116/#119) that semanticSummary.ts and
 * extractConditionsFromImages.ts used to each duplicate.
 * Spec: specs/features/057-enrichment-multi-provider-llm-strategy.md (AC12)
 */
import { ApiError, createPartFromBase64, createUserContent } from "@google/genai";
import { getGeminiClient, ENRICHMENT_MODEL } from "../geminiClient";
import type { LLMProvider } from "./types";
import { ProviderRateLimitError } from "./types";

const DEFAULT_RETRY_AFTER_MS = 15_000;

export function createGeminiProvider(apiKey: string): LLMProvider {
  // getGeminiClient() already resolves GEMINI_API_KEY from process.env itself
  // (existing lazy-singleton in geminiClient.ts) — apiKey is accepted here
  // only for symmetry with the registry's other providers.
  void apiKey;

  return {
    name: "gemini",
    supportsVision: true,
    rateLimit: { requestsPerMinute: 5 },

    async generateText(prompt: string): Promise<string> {
      try {
        const response = await getGeminiClient().models.generateContent({
          model: ENRICHMENT_MODEL,
          contents: prompt,
          config: { maxOutputTokens: 1024 },
        });
        return response.text?.trim() ?? "";
      } catch (err) {
        throw toProviderError(err);
      }
    },

    async generateFromImage(
      image: { data: string; mediaType: string },
      prompt: string
    ): Promise<string> {
      try {
        const response = await getGeminiClient().models.generateContent({
          model: ENRICHMENT_MODEL,
          contents: createUserContent([createPartFromBase64(image.data, image.mediaType), prompt]),
          config: { maxOutputTokens: 1024 },
        });
        return response.text?.trim() ?? "";
      } catch (err) {
        throw toProviderError(err);
      }
    },
  };
}

function toProviderError(err: unknown): unknown {
  if (err instanceof ApiError && err.status === 429) {
    return new ProviderRateLimitError("gemini", parseRetryDelayMs(err.message));
  }
  return err;
}

/** Parses Gemini's 429 error body (`error.details[].retryDelay`, e.g. "12s"). */
function parseRetryDelayMs(errorMessage: string): number {
  try {
    const parsed = JSON.parse(errorMessage) as {
      error?: { details?: Array<{ retryDelay?: string }> };
    };
    const retryDelay = parsed.error?.details?.find((d) => typeof d.retryDelay === "string")?.retryDelay;
    const match = retryDelay ? /^(\d+(?:\.\d+)?)s$/.exec(retryDelay) : null;
    if (match?.[1]) return Math.round(parseFloat(match[1]) * 1000);
  } catch {
    // malformed/unexpected error shape — fall through to the default below
  }
  return DEFAULT_RETRY_AFTER_MS;
}
