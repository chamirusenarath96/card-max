/**
 * Lazy Gemini client factory for the offer enrichment pipeline.
 * Spec: specs/features/044-ai-offer-enrichment.md (Architecture Decision #2)
 */
import { GoogleGenAI } from "@google/genai";

// Fast/cheap tier — enrichment runs in bulk over a day's worth of newly
// scraped offers, so latency/cost per offer matters more than raw quality.
// Also eligible for the Gemini API's free tier (see #95's cost caveat).
//
// gemini-2.0-flash was retired by Google on 2026-06-01 (every request
// returned free-tier "limit: 0" instead of a clean error). gemini-2.5-flash
// is Google's documented direct replacement and is still free-tier eligible
// as of 2026-08 — see the Gemini API free-tier model list before changing
// this again, since Google's free-tier lineup shifts over time.
export const ENRICHMENT_MODEL = "gemini-2.5-flash";

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
