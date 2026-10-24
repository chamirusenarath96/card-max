/**
 * LLM provider registry — unit tests
 * Spec: specs/features/057-enrichment-multi-provider-llm-strategy.md (AC1, AC2)
 */
import { describe, it, expect } from "vitest";
import { getConfiguredProviders } from "./registry";

describe("getConfiguredProviders", () => {
  it("returns [] when neither GEMINI_API_KEY nor GROQ_API_KEY is set (AC1)", () => {
    const providers = getConfiguredProviders({} as unknown as NodeJS.ProcessEnv);
    expect(providers).toEqual([]);
  });

  it("returns a single provider named 'gemini' when only GEMINI_API_KEY is set (AC2)", () => {
    const providers = getConfiguredProviders({ GEMINI_API_KEY: "key1" } as unknown as NodeJS.ProcessEnv);
    expect(providers).toHaveLength(1);
    expect(providers[0]!.name).toBe("gemini");
  });

  it("returns a single provider named 'groq' when only GROQ_API_KEY is set (AC2)", () => {
    const providers = getConfiguredProviders({ GROQ_API_KEY: "key2" } as unknown as NodeJS.ProcessEnv);
    expect(providers).toHaveLength(1);
    expect(providers[0]!.name).toBe("groq");
  });

  it("returns both providers in the order [gemini, groq] when both keys are set (AC2)", () => {
    const providers = getConfiguredProviders({
      GEMINI_API_KEY: "key1",
      GROQ_API_KEY: "key2",
    } as unknown as NodeJS.ProcessEnv);
    expect(providers.map((p) => p.name)).toEqual(["gemini", "groq"]);
  });
});
