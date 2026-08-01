/**
 * Lazy Anthropic client factory for the offer enrichment pipeline.
 * Spec: specs/features/044-ai-offer-enrichment.md (Architecture Decision #2)
 */
import Anthropic from "@anthropic-ai/sdk";

// Fast/cheap tier — enrichment runs in bulk over a day's worth of newly
// scraped offers, so latency/cost per offer matters more than raw quality.
export const ENRICHMENT_MODEL = "claude-haiku-4-5-20251001";

let client: Anthropic | undefined;

export function getAnthropicClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY environment variable is required for offer enrichment");
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}
