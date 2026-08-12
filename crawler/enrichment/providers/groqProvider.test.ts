/**
 * Groq LLM provider — unit tests
 * Spec: specs/features/057-enrichment-multi-provider-llm-strategy.md (AC13, AC14)
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { createGroqProvider, GROQ_TEXT_MODEL } from "./groqProvider";
import { ProviderRateLimitError } from "./types";

describe("createGroqProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("declares groq's static config", () => {
    const provider = createGroqProvider("key");
    expect(provider.name).toBe("groq");
    expect(provider.supportsVision).toBe(false);
  });

  describe("generateText", () => {
    it("posts to the chat-completions endpoint with the configured model and returns the response content (AC13)", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        headers: new Map() as unknown as Headers,
        json: async () => ({ choices: [{ message: { content: "Groq summary." } }] }),
      });
      vi.stubGlobal("fetch", fetchMock);
      const provider = createGroqProvider("test-key");

      const result = await provider.generateText("prompt text");

      expect(result).toBe("Groq summary.");
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
      expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
      expect(init.headers.Authorization).toBe("Bearer test-key");
      const body = JSON.parse(init.body as string);
      expect(body.model).toBe(GROQ_TEXT_MODEL);
      expect(body.messages).toEqual([{ role: "user", content: "prompt text" }]);
    });

    it("returns an empty string when the response has no choices", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          status: 200,
          ok: true,
          headers: new Map() as unknown as Headers,
          json: async () => ({}),
        })
      );
      const provider = createGroqProvider("key");
      expect(await provider.generateText("prompt")).toBe("");
    });

    it("throws ProviderRateLimitError with retryAfterMs parsed from the Retry-After header on 429 (AC13)", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          status: 429,
          ok: false,
          headers: new Map([["retry-after", "20"]]) as unknown as Headers,
        })
      );
      const provider = createGroqProvider("key");

      const err = await provider.generateText("prompt").catch((e) => e);

      expect(err).toBeInstanceOf(ProviderRateLimitError);
      expect((err as ProviderRateLimitError).retryAfterMs).toBe(20_000);
    });

    it("falls back to a 15000ms cooldown when the Retry-After header is absent on 429", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          status: 429,
          ok: false,
          headers: new Map() as unknown as Headers,
        })
      );
      const provider = createGroqProvider("key");

      const err = await provider.generateText("prompt").catch((e) => e);

      expect((err as ProviderRateLimitError).retryAfterMs).toBe(15_000);
    });

    it("throws a plain error on a non-429 non-ok response", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ status: 500, ok: false, headers: new Map() as unknown as Headers })
      );
      const provider = createGroqProvider("key");

      await expect(provider.generateText("prompt")).rejects.toThrow("Groq HTTP 500");
    });
  });

  describe("generateFromImage", () => {
    it("rejects — Groq does not implement vision — and is never selected for vision (AC14)", async () => {
      const provider = createGroqProvider("key");
      await expect(
        provider.generateFromImage({ data: "x", mediaType: "image/png" }, "prompt")
      ).rejects.toThrow(/vision/i);
    });
  });
});
