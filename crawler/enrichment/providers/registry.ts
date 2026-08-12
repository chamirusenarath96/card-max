/**
 * LLM provider registry — pure, unit-testable.
 * Spec: specs/features/057-enrichment-multi-provider-llm-strategy.md (AC1, AC2)
 */
import type { LLMProvider } from "./types";
import { createGeminiProvider } from "./geminiProvider";
import { createGroqProvider } from "./groqProvider";

export function getConfiguredProviders(env: NodeJS.ProcessEnv = process.env): LLMProvider[] {
  const providers: LLMProvider[] = [];
  if (env.GEMINI_API_KEY) providers.push(createGeminiProvider(env.GEMINI_API_KEY));
  if (env.GROQ_API_KEY) providers.push(createGroqProvider(env.GROQ_API_KEY));
  return providers; // order matters: Gemini first (existing/vision-capable), Groq spills overflow
}
