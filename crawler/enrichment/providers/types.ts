/**
 * Provider-agnostic interface for offer-enrichment LLM providers.
 * Spec: specs/features/057-enrichment-multi-provider-llm-strategy.md
 */
export interface LLMProvider {
  name: "gemini" | "groq";
  supportsVision: boolean;
  rateLimit: { requestsPerMinute: number; requestsPerDay?: number };
  generateText(prompt: string): Promise<string>;
  generateFromImage(image: { data: string; mediaType: string }, prompt: string): Promise<string>;
}

export class ProviderRateLimitError extends Error {
  constructor(
    public readonly provider: string,
    public readonly retryAfterMs: number
  ) {
    super(`${provider} rate-limited, retry after ${retryAfterMs}ms`);
    this.name = "ProviderRateLimitError";
  }
}
