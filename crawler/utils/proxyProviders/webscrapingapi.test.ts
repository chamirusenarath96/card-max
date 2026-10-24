/**
 * WebScrapingAPI provider — unit tests
 * Spec: specs/features/053-scraping-proxy-fallback.md (AC12),
 *       specs/features/060-fix-zenrows-boc-provider-errors.md (AC2)
 */
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { createWebScrapingApiProvider } from "./webscrapingapi";

const originalFetch = global.fetch;

describe("createWebScrapingApiProvider", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("issues a request containing the API key and URL-encoded target URL, and resolves with the response body (AC12)", async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve("<html>ok</html>"),
    } as Response);

    const provider = createWebScrapingApiProvider("test-key");
    const html = await provider.fetchHtml("https://www.boc.lk/personal-banking/card-offers/dining");

    expect(html).toBe("<html>ok</html>");
    const calledUrl = vi.mocked(global.fetch).mock.calls[0]![0] as string;
    expect(calledUrl).toContain("api_key=test-key");
    expect(calledUrl).toContain(encodeURIComponent("https://www.boc.lk/personal-banking/card-offers/dining"));
  });

  it("rejects on a non-2xx response (AC12)", async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve(""),
    } as Response);

    const provider = createWebScrapingApiProvider("test-key");
    await expect(provider.fetchHtml("https://example.com")).rejects.toThrow("WebScrapingAPI HTTP 500");
  });

  it("includes the response body text in the thrown error when present (AC2)", async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve('{"error":"rate limit exceeded"}'),
    } as Response);

    const provider = createWebScrapingApiProvider("test-key");
    await expect(provider.fetchHtml("https://example.com")).rejects.toThrow(
      'WebScrapingAPI HTTP 429 fetching https://example.com: {"error":"rate limit exceeded"}'
    );
  });
});
