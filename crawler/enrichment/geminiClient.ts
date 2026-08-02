/**
 * Lazy Gemini client factory for the offer enrichment pipeline.
 * Spec: specs/features/044-ai-offer-enrichment.md (Architecture Decision #2)
 */
import { GoogleGenAI } from "@google/genai";

// Fast/cheap tier — enrichment runs in bulk over a day's worth of newly
// scraped offers, so latency/cost per offer matters more than raw quality.
// Also eligible for the Gemini API's free tier (see #95's cost caveat).
export const ENRICHMENT_MODEL = "gemini-2.0-flash";

let client: GoogleGenAI | undefined;

export function getGeminiClient(): GoogleGenAI {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is required for offer enrichment");
    }
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}
