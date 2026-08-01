/**
 * Generates a cleaned, search-oriented summary of an offer via Claude.
 * Spec: specs/features/044-ai-offer-enrichment.md (AC3)
 */
import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient, ENRICHMENT_MODEL } from "./anthropicClient";

export interface SemanticSummaryInput {
  title: string;
  description?: string;
  merchant: string;
  category: string;
}

export async function generateSemanticSummary(
  input: SemanticSummaryInput
): Promise<string | undefined> {
  const client = getAnthropicClient();

  const response = await client.messages.create({
    model: ENRICHMENT_MODEL,
    max_tokens: 200,
    messages: [{ role: "user", content: buildPrompt(input) }],
  });

  const text = extractText(response);
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

function extractText(response: Anthropic.Message): string {
  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join(" ")
    .trim();
}
