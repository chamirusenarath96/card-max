/**
 * Generates a cleaned, search-oriented summary of an offer via the shared
 * LLM provider router.
 * Spec: specs/features/044-ai-offer-enrichment.md (AC3)
 *       specs/features/057-enrichment-multi-provider-llm-strategy.md (AC15)
 */
import { generateText, sharedRouter } from "./providers/router";

export interface SemanticSummaryInput {
  title: string;
  description?: string;
  merchant: string;
  category: string;
}

export async function generateSemanticSummary(
  input: SemanticSummaryInput
): Promise<string | undefined> {
  const text = (await generateText(sharedRouter, buildPrompt(input))).trim();
  return text || undefined;
}

function buildPrompt({ title, description, merchant, category }: SemanticSummaryInput): string {
  return [
    "Write a single, clean 1-2 sentence summary of this credit card offer for a semantic search index.",
    "Focus on what the deal is, the merchant, and the category. Do not include dates.",
    "Respond with ONLY the summary text — no preamble, no quotes.",
    "",
    `Merchant: ${merchant}`,
    `Category: ${category}`,
    `Title: ${title}`,
    description ? `Description: ${description}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
