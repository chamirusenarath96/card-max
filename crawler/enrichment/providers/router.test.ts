/**
 * ProviderRouter + generateText/generateFromImage facades — unit tests
 * Spec: specs/features/057-enrichment-multi-provider-llm-strategy.md (AC3-AC11)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ProviderRouter, generateText, generateFromImage } from "./router";
import { ProviderRateLimitError } from "./types";
import type { LLMProvider } from "./types";

function makeProvider(overrides: Partial<LLMProvider> = {}): LLMProvider {
  return {
    name: "gemini",
    supportsVision: true,
    rateLimit: { requestsPerMinute: 5 },
    generateText: vi.fn(),
    generateFromImage: vi.fn(),
    ...overrides,
  };
}

describe("ProviderRouter.selectProvider", () => {
  it("returns a provider with headroom and no cooldown (AC3)", () => {
    const provider = makeProvider();
    const router = new ProviderRouter([provider]);
    expect(router.selectProvider("text")).toBe(provider);
  });

  it("skips a non-vision-capable provider for a vision request and returns null if none support vision (AC4)", () => {
    const textOnly = makeProvider({ name: "groq", supportsVision: false });
    const router = new ProviderRouter([textOnly]);
    expect(router.selectProvider("vision")).toBeNull();
  });

  it("selects the vision-capable provider, skipping a non-vision one ahead of it (AC4)", () => {
    const textOnly = makeProvider({ name: "groq", supportsVision: false });
    const vision = makeProvider({ name: "gemini", supportsVision: true });
    const router = new ProviderRouter([textOnly, vision]);
    expect(router.selectProvider("vision")).toBe(vision);
  });

  it("returns null when the only matching provider has exhausted its per-minute window (AC5)", () => {
    const provider = makeProvider({ rateLimit: { requestsPerMinute: 1 } });
    const router = new ProviderRouter([provider]);
    router.recordRequest(provider.name);
    expect(router.selectProvider("text")).toBeNull();
  });

  it("returns null when the only matching provider is cooling down (AC5)", () => {
    const provider = makeProvider();
    const router = new ProviderRouter([provider]);
    router.markCooldown(provider.name, Date.now() + 5_000);
    expect(router.selectProvider("text")).toBeNull();
  });

  it("skips a cooling-down provider then makes it selectable again once its cooldown expires (AC6)", () => {
    vi.useFakeTimers();
    try {
      const provider = makeProvider();
      const router = new ProviderRouter([provider]);
      const now = Date.now();

      router.markCooldown(provider.name, now + 5_000);
      expect(router.selectProvider("text")).toBeNull();

      vi.setSystemTime(now + 5_001);
      expect(router.selectProvider("text")).toBe(provider);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("generateText", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the first selected provider's result without touching any other provider (AC7)", async () => {
    const p1 = makeProvider({ name: "gemini" });
    (p1.generateText as ReturnType<typeof vi.fn>).mockResolvedValue("hello");
    const p2 = makeProvider({ name: "groq", supportsVision: false });
    const router = new ProviderRouter([p1, p2]);

    const result = await generateText(router, "prompt");

    expect(result).toBe("hello");
    expect(p1.generateText).toHaveBeenCalledWith("prompt");
    expect(p2.generateText).not.toHaveBeenCalled();
  });

  it("retries on the next provider when the first is rate-limited, returning the second's result (AC8)", async () => {
    const p1 = makeProvider({ name: "gemini" });
    (p1.generateText as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ProviderRateLimitError("gemini", 1_000)
    );
    const p2 = makeProvider({ name: "groq", supportsVision: false });
    (p2.generateText as ReturnType<typeof vi.fn>).mockResolvedValue("from groq");
    const router = new ProviderRouter([p1, p2]);

    const result = await generateText(router, "prompt");

    expect(result).toBe("from groq");
    expect(p1.generateText).toHaveBeenCalledTimes(1);
    expect(p2.generateText).toHaveBeenCalledTimes(1);
  });

  it("rejects immediately without retrying on a non-rate-limit error (AC9)", async () => {
    const p1 = makeProvider({ name: "gemini" });
    (p1.generateText as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("boom"));
    const p2 = makeProvider({ name: "groq", supportsVision: false });
    const router = new ProviderRouter([p1, p2]);

    await expect(generateText(router, "prompt")).rejects.toThrow("boom");
    expect(p2.generateText).not.toHaveBeenCalled();
  });

  it("sleeps until the shortest cooldown expires and then resumes when ≤30s (AC10)", async () => {
    const p1 = makeProvider({ name: "gemini" });
    (p1.generateText as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new ProviderRateLimitError("gemini", 10_000))
      .mockResolvedValueOnce("resumed");
    const router = new ProviderRouter([p1]);

    const promise = generateText(router, "prompt");
    await vi.advanceTimersByTimeAsync(10_000);
    const result = await promise;

    expect(result).toBe("resumed");
    expect(p1.generateText).toHaveBeenCalledTimes(2);
  });

  it("rejects without sleeping when the shortest cooldown exceeds 30s (AC11)", async () => {
    const p1 = makeProvider({ name: "gemini" });
    (p1.generateText as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ProviderRateLimitError("gemini", 31_000)
    );
    const router = new ProviderRouter([p1]);

    await expect(generateText(router, "prompt")).rejects.toThrow(/cooling down/);
    expect(p1.generateText).toHaveBeenCalledTimes(1);
  });

  it("rejects when no configured provider matches the requested capability", async () => {
    const router = new ProviderRouter([]);
    await expect(generateText(router, "prompt")).rejects.toThrow(/No text-capable provider/);
  });
});

describe("generateFromImage", () => {
  it("skips a non-vision provider entirely and never selects it for vision, per AC4/AC14", async () => {
    const groq = makeProvider({ name: "groq", supportsVision: false });
    (groq.generateFromImage as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("groq provider does not support vision")
    );
    const gemini = makeProvider({ name: "gemini", supportsVision: true });
    (gemini.generateFromImage as ReturnType<typeof vi.fn>).mockResolvedValue("vision text");
    const router = new ProviderRouter([groq, gemini]);

    const result = await generateFromImage(router, { data: "x", mediaType: "image/png" }, "prompt");

    expect(result).toBe("vision text");
    expect(groq.generateFromImage).not.toHaveBeenCalled();
  });
});
