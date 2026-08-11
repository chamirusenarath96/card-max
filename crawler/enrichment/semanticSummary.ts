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
    // thinkingConfig: { thinkingBudget: 0 } previously disabled Gemini's
    // "thinking" pass, but a self-updating "-latest" model rotation started
    // rejecting that value with 400 INVALID_ARGUMENT (#119). Rather than pin
    // a new magic thinkingBudget number that could break identically on the
    // next rotation, we omit thinkingConfig and instead give maxOutputTokens
    // enough headroom to absorb an unavoidable thinking pass before the
    // model writes the actual answer, avoiding the original truncation
    // problem (#116) without depending on the field being supported.
    config: { maxOutputTokens: 1024 },
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
