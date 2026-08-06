/**
 * Lazy Gemini client factory for the offer enrichment pipeline.
 * Spec: specs/features/044-ai-offer-enrichment.md (Architecture Decision #2)
 */
import { GoogleGenAI } from "@google/genai";

// Fast/cheap tier — enrichment runs in bulk over a day's worth of newly
// scraped offers, so latency/cost per offer matters more than raw quality.
// Also eligible for the Gemini API's free tier (see #95's cost caveat).
//
// Pinned dated model IDs kept breaking within weeks as Google retired/
// gated them: gemini-2.0-flash was retired 2026-06-01 ("limit: 0" instead
// of a clean error), then gemini-2.5-flash turned out to be blocked for
// new API projects specifically ("no longer available to new users", 404).
// Using Google's self-updating "-latest" alias instead, so this always
// resolves to whichever Flash model Google currently recommends for new
// projects, without needing another manual migration each time the
// lineup shifts.
export const ENRICHMENT_MODEL = "gemini-flash-latest";

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
