/**
 * Groq LLM provider — text-only, OpenAI-compatible chat completions endpoint.
 * Vision stays Gemini-only (see spec Notes on Groq's preview-tier vision models).
 * Spec: specs/features/057-enrichment-multi-provider-llm-strategy.md (AC13, AC14)
 */
import type { LLMProvider } from "./types";
import { ProviderRateLimitError } from "./types";

// Pinned to a single named constant — same "pin one constant, don't scatter
// the literal" lesson geminiClient.ts documents about model-ID churn.
export const GROQ_TEXT_MODEL = "llama-3.3-70b-versatile";

const DEFAULT_RETRY_AFTER_MS = 15_000;

interface GroqChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

export function createGroqProvider(apiKey: string): LLMProvider {
  return {
    name: "groq",
    supportsVision: false,
    rateLimit: { requestsPerMinute: 30, requestsPerDay: 14_400 }, // confirmed free-tier limits, Aug 2026

    async generateText(prompt: string): Promise<string> {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: GROQ_TEXT_MODEL,
          messages: [{ role: "user", content: prompt }],
          max_tokens: 300,
        }),
      });

      if (res.status === 429) {
        const retryAfterMs = Number(res.headers.get("retry-after") ?? "") * 1000 || DEFAULT_RETRY_AFTER_MS;
        throw new ProviderRateLimitError("groq", retryAfterMs);
      }
      if (!res.ok) throw new Error(`Groq HTTP ${res.status}`);

      const body = (await res.json()) as GroqChatCompletionResponse;
      return body.choices?.[0]?.message?.content ?? "";
    },

    async generateFromImage(): Promise<string> {
      throw new Error("groq provider does not support vision");
    },
  };
}
