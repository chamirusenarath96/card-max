/**
 * findImageUrls / extractTextFromImages — unit tests
 * Spec: specs/features/044-ai-offer-enrichment.md (AC5, Edge Cases)
 *
 * // TODO: integration test needs a real source page + real AI vision call —
 * this is a mock-based approximation per CLAUDE.md's test coverage gate.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

vi.mock("./anthropicClient", () => ({
  getAnthropicClient: () => ({ messages: { create: mockCreate } }),
  ENRICHMENT_MODEL: "claude-haiku-4-5-20251001",
}));

import { findImageUrls, extractTextFromImages } from "./extractConditionsFromImages";

describe("findImageUrls", () => {
  it("extracts absolute image URLs from relative src attributes", () => {
    const html = `<div><img src="/offers/banner.jpg"></div>`;
    expect(findImageUrls(html, "https://bank.lk/offers/pizza")).toEqual([
      "https://bank.lk/offers/banner.jpg",
    ]);
  });

  it("keeps already-absolute image URLs as-is", () => {
    const html = `<img src="https://cdn.bank.lk/promo.png">`;
    expect(findImageUrls(html, "https://bank.lk/offers/pizza")).toEqual([
      "https://cdn.bank.lk/promo.png",
    ]);
  });

  it("skips logos, icons, and svg decorative images", () => {
    const html = `
      <img src="/assets/logo.png">
      <img src="/assets/icon-star.png">
      <img src="/assets/arrow.svg">
      <img src="/offers/real-banner.jpg">
    `;
    expect(findImageUrls(html, "https://bank.lk")).toEqual(["https://bank.lk/offers/real-banner.jpg"]);
  });

  it("caps results at 3 images", () => {
    const html = Array.from({ length: 6 }, (_, i) => `<img src="/img-${i}.jpg">`).join("\n");
    expect(findImageUrls(html, "https://bank.lk")).toHaveLength(3);
  });

  it("deduplicates identical resolved URLs", () => {
    const html = `<img src="/a.jpg"><img src="/a.jpg">`;
    expect(findImageUrls(html, "https://bank.lk")).toEqual(["https://bank.lk/a.jpg"]);
  });

  it("returns an empty array when the page has no images", () => {
    expect(findImageUrls("<div>no images here</div>", "https://bank.lk")).toEqual([]);
  });
});

describe("extractTextFromImages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("downloads an image and returns the vision-extracted conditions text (AC5)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Map([
          ["content-type", "image/jpeg"],
          ["content-length", "1000"],
        ]) as unknown as Headers,
        arrayBuffer: async () => new ArrayBuffer(1000),
      })
    );
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "Valid every Thursday in August." }],
    });

    const result = await extractTextFromImages(["https://bank.lk/promo.jpg"]);

    expect(result).toBe("Valid every Thursday in August.");
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("returns undefined when the model finds no conditions text (NONE)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Map([["content-type", "image/png"]]) as unknown as Headers,
        arrayBuffer: async () => new ArrayBuffer(100),
      })
    );
    mockCreate.mockResolvedValue({ content: [{ type: "text", text: "NONE" }] });

    const result = await extractTextFromImages(["https://bank.lk/promo.png"]);

    expect(result).toBeUndefined();
  });

  it("skips an image over the size budget without throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Map([
          ["content-type", "image/jpeg"],
          ["content-length", String(10 * 1024 * 1024)], // 10MB > 5MB cap
        ]) as unknown as Headers,
        arrayBuffer: async () => new ArrayBuffer(10 * 1024 * 1024),
      })
    );

    const result = await extractTextFromImages(["https://bank.lk/huge.jpg"]);

    expect(result).toBeUndefined();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("skips a non-image content-type response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Map([["content-type", "text/html"]]) as unknown as Headers,
        arrayBuffer: async () => new ArrayBuffer(100),
      })
    );

    const result = await extractTextFromImages(["https://bank.lk/not-an-image"]);

    expect(result).toBeUndefined();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("continues to the next image when one download fails", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValueOnce({
        ok: true,
        headers: new Map([["content-type", "image/jpeg"]]) as unknown as Headers,
        arrayBuffer: async () => new ArrayBuffer(100),
      });
    vi.stubGlobal("fetch", fetchMock);
    mockCreate.mockResolvedValue({ content: [{ type: "text", text: "Weekends only." }] });

    const result = await extractTextFromImages(["https://bank.lk/broken.jpg", "https://bank.lk/ok.jpg"]);

    expect(result).toBe("Weekends only.");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns undefined for an empty image URL list without calling fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await extractTextFromImages([]);

    expect(result).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
