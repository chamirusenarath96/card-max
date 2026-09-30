/**
 * Cloudflare Workers scraping-proxy provider — unit tests
 * Spec: specs/features/072-cloudflare-workers-scraping.md (AC1, AC2)
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { createWorkersProvider, _shouldRender } from "./workers";

describe("createWorkersProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs { url, render, bank } and returns html on success (AC1)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ html: "<html>ok</html>" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = createWorkersProvider("https://worker.example.dev/scrape", "secret123");
    const html = await provider.fetchHtml("https://www.nationstrust.com/promotions/what-s-new", "nations_trust_bank");

    expect(html).toBe("<html>ok</html>");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://worker.example.dev/scrape",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer secret123" }),
        body: JSON.stringify({
          url: "https://www.nationstrust.com/promotions/what-s-new",
          render: false,
          bank: "nations_trust_bank",
        }),
      })
    );
  });

  it("omits the Authorization header when no secret is configured", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ html: "<html/>" }) });
    vi.stubGlobal("fetch", fetchMock);

    const provider = createWorkersProvider("https://worker.example.dev/scrape");
    await provider.fetchHtml("https://example.com");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("throws with status and truncated body on a non-OK response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => "forbidden",
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = createWorkersProvider("https://worker.example.dev/scrape");
    await expect(provider.fetchHtml("https://example.com")).rejects.toThrow(/403/);
  });

  it("throws when the Worker response is missing the html field", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ error: "upstream timeout" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = createWorkersProvider("https://worker.example.dev/scrape");
    await expect(provider.fetchHtml("https://example.com")).rejects.toThrow(/upstream timeout/);
  });

  it("requests render:true for sampath_bank (JS-rendered SPA API) (AC2)", () => {
    expect(_shouldRender("sampath_bank")).toBe(true);
    expect(_shouldRender("nations_trust_bank")).toBe(false);
    expect(_shouldRender(undefined)).toBe(false);
  });
});
