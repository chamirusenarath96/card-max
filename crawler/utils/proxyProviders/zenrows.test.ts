/**
 * ZenRows provider — unit tests
 * Spec: specs/features/053-scraping-proxy-fallback.md (AC11)
 */
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { createZenRowsProvider } from "./zenrows";

const originalFetch = global.fetch;

describe("createZenRowsProvider", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("issues a request containing the API key and URL-encoded target URL, and resolves with the response body (AC11)", async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve("<html>ok</html>"),
    } as Response);

    const provider = createZenRowsProvider("test-key");
    const html = await provider.fetchHtml("https://www.combank.lk/rewards-promotions");

    expect(html).toBe("<html>ok</html>");
    const calledUrl = vi.mocked(global.fetch).mock.calls[0]![0] as string;
    expect(calledUrl).toContain("apikey=test-key");
    expect(calledUrl).toContain(encodeURIComponent("https://www.combank.lk/rewards-promotions"));
  });

  it("rejects on a non-2xx response (AC11)", async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 403,
      text: () => Promise.resolve(""),
    } as Response);

    const provider = createZenRowsProvider("test-key");
    await expect(provider.fetchHtml("https://example.com")).rejects.toThrow("ZenRows HTTP 403");
  });
});
