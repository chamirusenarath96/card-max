/**
 * ZenRows provider — unit tests
 * Spec: specs/features/053-scraping-proxy-fallback.md (AC11),
 *       specs/features/060-fix-zenrows-boc-provider-errors.md (AC1, AC2),
 *       specs/features/061-boc-ntb-zenrows-js-render.md (AC1-AC5)
 */
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from "vitest";
import { createZenRowsProvider } from "./zenrows";

const originalFetch = global.fetch;
const originalPremium = process.env.ZENROWS_PREMIUM_PROXY;
const originalJsRenderMap = process.env.PROXY_BANK_JS_RENDER_MAP;
const originalBankMap = process.env.PROXY_BANK_MAP;

describe("createZenRowsProvider", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    if (originalPremium === undefined) delete process.env.ZENROWS_PREMIUM_PROXY;
    else process.env.ZENROWS_PREMIUM_PROXY = originalPremium;
    if (originalJsRenderMap === undefined) delete process.env.PROXY_BANK_JS_RENDER_MAP;
    else process.env.PROXY_BANK_JS_RENDER_MAP = originalJsRenderMap;
    if (originalBankMap === undefined) delete process.env.PROXY_BANK_MAP;
    else process.env.PROXY_BANK_MAP = originalBankMap;
    vi.restoreAllMocks();
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

  it("omits premium_proxy by default (AC1)", async () => {
    delete process.env.ZENROWS_PREMIUM_PROXY;
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve("<html>ok</html>"),
    } as Response);

    const provider = createZenRowsProvider("test-key");
    await provider.fetchHtml("https://example.com");

    const calledUrl = vi.mocked(global.fetch).mock.calls[0]![0] as string;
    expect(calledUrl).not.toContain("premium_proxy");
  });

  it("includes premium_proxy=true only when ZENROWS_PREMIUM_PROXY=true (AC1)", async () => {
    process.env.ZENROWS_PREMIUM_PROXY = "true";
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve("<html>ok</html>"),
    } as Response);

    const provider = createZenRowsProvider("test-key");
    await provider.fetchHtml("https://example.com");

    const calledUrl = vi.mocked(global.fetch).mock.calls[0]![0] as string;
    expect(calledUrl).toContain("premium_proxy=true");
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

  it("includes the response body text in the thrown error when present (AC2)", async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 422,
      text: () => Promise.resolve('{"message":"premium_proxy not available on this plan"}'),
    } as Response);

    const provider = createZenRowsProvider("test-key");
    await expect(provider.fetchHtml("https://example.com")).rejects.toThrow(
      "ZenRows HTTP 422 fetching https://example.com: {\"message\":\"premium_proxy not available on this plan\"}"
    );
  });

  it("omits js_render by default for commercial_bank (AC2)", async () => {
    delete process.env.PROXY_BANK_JS_RENDER_MAP;
    delete process.env.PROXY_BANK_MAP;
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve("<html>ok</html>"),
    } as Response);

    const provider = createZenRowsProvider("test-key");
    await provider.fetchHtml("https://www.combank.lk/rewards-promotions", "commercial_bank");

    const calledUrl = vi.mocked(global.fetch).mock.calls[0]![0] as string;
    expect(calledUrl).not.toContain("js_render");
  });

  it("includes js_render=true for bank_of_ceylon by default (AC1)", async () => {
    delete process.env.PROXY_BANK_JS_RENDER_MAP;
    delete process.env.PROXY_BANK_MAP;
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve("<html>ok</html>"),
    } as Response);

    const provider = createZenRowsProvider("test-key");
    await provider.fetchHtml("https://www.boc.lk/personal-banking/card-offers/dining", "bank_of_ceylon");

    const calledUrl = vi.mocked(global.fetch).mock.calls[0]![0] as string;
    expect(calledUrl).toContain("js_render=true");
  });

  it("includes js_render=true for nations_trust_bank by default (AC1)", async () => {
    delete process.env.PROXY_BANK_JS_RENDER_MAP;
    delete process.env.PROXY_BANK_MAP;
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve("<html>ok</html>"),
    } as Response);

    const provider = createZenRowsProvider("test-key");
    await provider.fetchHtml("https://www.nationstrust.com/promotions/what-s-new", "nations_trust_bank");

    const calledUrl = vi.mocked(global.fetch).mock.calls[0]![0] as string;
    expect(calledUrl).toContain("js_render=true");
  });

  it("omits js_render when explicitly disabled via PROXY_BANK_JS_RENDER_MAP (AC2)", async () => {
    process.env.PROXY_BANK_JS_RENDER_MAP = JSON.stringify({ bank_of_ceylon: false });
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve("<html>ok</html>"),
    } as Response);

    const provider = createZenRowsProvider("test-key");
    await provider.fetchHtml("https://www.boc.lk/test", "bank_of_ceylon");

    const calledUrl = vi.mocked(global.fetch).mock.calls[0]![0] as string;
    expect(calledUrl).not.toContain("js_render");
  });

  it("includes both premium_proxy and js_render when both enabled", async () => {
    process.env.ZENROWS_PREMIUM_PROXY = "true";
    delete process.env.PROXY_BANK_JS_RENDER_MAP;
    delete process.env.PROXY_BANK_MAP;
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve("<html>ok</html>"),
    } as Response);

    const provider = createZenRowsProvider("test-key");
    await provider.fetchHtml("https://www.boc.lk/test", "bank_of_ceylon");

    const calledUrl = vi.mocked(global.fetch).mock.calls[0]![0] as string;
    expect(calledUrl).toContain("premium_proxy=true");
    expect(calledUrl).toContain("js_render=true");
  });

  it("respects extended PROXY_BANK_MAP object form with jsRender", async () => {
    process.env.PROXY_BANK_MAP = JSON.stringify({ bank_of_ceylon: { provider: "zenrows", jsRender: true } });
    delete process.env.PROXY_BANK_JS_RENDER_MAP;
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve("<html>ok</html>"),
    } as Response);

    const provider = createZenRowsProvider("test-key");
    await provider.fetchHtml("https://www.boc.lk/test", "bank_of_ceylon");

    const calledUrl = vi.mocked(global.fetch).mock.calls[0]![0] as string;
    expect(calledUrl).toContain("js_render=true");
  });
});
