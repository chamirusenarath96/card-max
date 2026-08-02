/**
 * Generates a cleaned, search-oriented summary of an offer via Gemini.
 * Spec: specs/features/044-ai-offer-enrichment.md (AC3)
 */
import { getGeminiClient, ENRICHMENT_MODEL } from "./geminiClient";

export interface SemanticSummaryInput {
  title: string;
  description?: string;
  merchant: string;
  category: string;
}

export async function generateSemanticSummary(
  input: SemanticSummaryInput
): Promise<string | undefined> {
  const client = getGeminiClient();

  const response = await client.models.generateContent({
    model: ENRICHMENT_MODEL,
    contents: buildPrompt(input),
    config: { maxOutputTokens: 200 },
  });

  const text = response.text?.trim();
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
