/**
 * fetchHtmlWithProxyFallback â€” unit tests
 * Spec: specs/features/053-scraping-proxy-fallback.md (AC7-AC10),
 *       specs/features/060-fix-zenrows-boc-provider-errors.md (AC3-AC5)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./proxyProviders/registry", () => ({
  getConfiguredProviders: vi.fn(),
  getBankProviderMap: vi.fn(),
  orderedProvidersForBank: vi.fn(),
}));

vi.mock("./http", async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const actual = await vi.importActual("./http") as any;
  return { ...actual, sleep: vi.fn().mockResolvedValue(undefined) };
});

import { fetchHtmlWithProxyFallback } from "./proxyFetch";
import { getConfiguredProviders, getBankProviderMap, orderedProvidersForBank } from "./proxyProviders/registry";

describe("fetchHtmlWithProxyFallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the direct fetch's result and never calls getConfiguredProviders/orderedProvidersForBank when the direct fetch resolves (AC7)", async () => {
    const directFetch = vi.fn().mockResolvedValue("<html>direct</html>");

    const html = await fetchHtmlWithProxyFallback("https://example.com", "commercial_bank", directFetch);

    expect(html).toBe("<html>direct</html>");
    expect(getConfiguredProviders).not.toHaveBeenCalled();
    expect(orderedProvidersForBank).not.toHaveBeenCalled();
  });

  it("calls the bank's selected provider's fetchHtml() and returns its result when the direct fetch rejects and a provider is configured (AC8)", async () => {
    const directFetch = vi.fn().mockRejectedValue(new Error("HTTP 403"));
    const providerFetchHtml = vi.fn().mockResolvedValue("<html>proxied</html>");
    vi.mocked(getConfiguredProviders).mockReturnValue([{ name: "zenrows", fetchHtml: providerFetchHtml }]);
    vi.mocked(getBankProviderMap).mockReturnValue({});
    vi.mocked(orderedProvidersForBank).mockReturnValue([{ name: "zenrows", fetchHtml: providerFetchHtml }]);

    const html = await fetchHtmlWithProxyFallback("https://example.com", "commercial_bank", directFetch);

    expect(html).toBe("<html>proxied</html>");
    expect(providerFetchHtml).toHaveBeenCalledWith("https://example.com", expect.any(String));
  });

  it("rejects (does not swallow) when the direct fetch rejects and no provider is configured (AC9)", async () => {
    const directFetch = vi.fn().mockRejectedValue(new Error("HTTP 403"));
    vi.mocked(getConfiguredProviders).mockReturnValue([]);
    vi.mocked(getBankProviderMap).mockReturnValue({});
    vi.mocked(orderedProvidersForBank).mockReturnValue([]);

    await expect(
      fetchHtmlWithProxyFallback("https://example.com", "commercial_bank", directFetch)
    ).rejects.toThrow(/no proxy provider is configured/);
  });

  it("rejects with the provider's error when both the direct fetch and the single configured provider's fetch reject (AC4, AC10)", async () => {
    const directFetch = vi.fn().mockRejectedValue(new Error("HTTP 403"));
    const providerError = new Error("ZenRows HTTP 500");
    const providerFetchHtml = vi.fn().mockRejectedValue(providerError);
    vi.mocked(getConfiguredProviders).mockReturnValue([{ name: "zenrows", fetchHtml: providerFetchHtml }]);
    vi.mocked(getBankProviderMap).mockReturnValue({});
    vi.mocked(orderedProvidersForBank).mockReturnValue([{ name: "zenrows", fetchHtml: providerFetchHtml }]);

    await expect(
      fetchHtmlWithProxyFallback("https://example.com", "commercial_bank", directFetch)
    ).rejects.toThrow("ZenRows HTTP 500");
  });

  it("falls through to the second provider when the first configured provider throws (AC3)", async () => {
    const directFetch = vi.fn().mockRejectedValue(new Error("HTTP 403"));
    const firstFetchHtml = vi.fn().mockRejectedValue(new Error("ZenRows HTTP 422"));
    const secondFetchHtml = vi.fn().mockResolvedValue("<html>from second provider</html>");
    vi.mocked(getConfiguredProviders).mockReturnValue([
      { name: "zenrows", fetchHtml: firstFetchHtml },
      { name: "webscrapingapi", fetchHtml: secondFetchHtml },
    ]);
    vi.mocked(getBankProviderMap).mockReturnValue({});
    vi.mocked(orderedProvidersForBank).mockReturnValue([
      { name: "zenrows", fetchHtml: firstFetchHtml },
      { name: "webscrapingapi", fetchHtml: secondFetchHtml },
    ]);

    const html = await fetchHtmlWithProxyFallback("https://example.com", "boc", directFetch);

    expect(html).toBe("<html>from second provider</html>");
    expect(firstFetchHtml).toHaveBeenCalledWith("https://example.com", expect.any(String));
    expect(secondFetchHtml).toHaveBeenCalledWith("https://example.com", expect.any(String));
  });

  it("rejects with the last provider's error when every configured provider fails (AC3)", async () => {
    const directFetch = vi.fn().mockRejectedValue(new Error("HTTP 403"));
    const firstFetchHtml = vi.fn().mockRejectedValue(new Error("ZenRows HTTP 422"));
    const secondFetchHtml = vi.fn().mockRejectedValue(new Error("WebScrapingAPI HTTP 500"));
    vi.mocked(getConfiguredProviders).mockReturnValue([
      { name: "zenrows", fetchHtml: firstFetchHtml },
      { name: "webscrapingapi", fetchHtml: secondFetchHtml },
    ]);
    vi.mocked(getBankProviderMap).mockReturnValue({});
    vi.mocked(orderedProvidersForBank).mockReturnValue([
      { name: "zenrows", fetchHtml: firstFetchHtml },
      { name: "webscrapingapi", fetchHtml: secondFetchHtml },
    ]);

    await expect(
      fetchHtmlWithProxyFallback("https://example.com", "boc", directFetch)
    ).rejects.toThrow("WebScrapingAPI HTTP 500");
  });

  it("retries direct fetch once on ConnectTimeoutError and returns on second success without calling proxy (063 AC1)", async () => {
    const err = new Error("fetch failed");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (err as any).cause = new Error("ConnectTimeoutError: Connect Timeout Error");
    const directFetch = vi.fn().mockRejectedValueOnce(err).mockResolvedValueOnce("<html>retry success</html>");
    vi.mocked(getConfiguredProviders).mockReturnValue([{ name: "zenrows", fetchHtml: vi.fn() }]);
    vi.mocked(getBankProviderMap).mockReturnValue({});
    vi.mocked(orderedProvidersForBank).mockReturnValue([{ name: "zenrows", fetchHtml: vi.fn() }]);

    const html = await fetchHtmlWithProxyFallback("https://www.combank.lk/test", "commercial_bank", directFetch);

    expect(html).toBe("<html>retry success</html>");
    expect(directFetch).toHaveBeenCalledTimes(2);
    expect(orderedProvidersForBank).not.toHaveBeenCalled();
  });

  it("falls back to proxy when ConnectTimeout retry also fails and proxy succeeds (063 AC1)", async () => {
    const err = new Error("UND_ERR_CONNECT_TIMEOUT");
    const directFetch = vi.fn().mockRejectedValue(err);
    const providerFetch = vi.fn().mockResolvedValue("<html>proxied after timeout</html>");
    vi.mocked(getConfiguredProviders).mockReturnValue([{ name: "zenrows", fetchHtml: providerFetch }]);
    vi.mocked(getBankProviderMap).mockReturnValue({});
    vi.mocked(orderedProvidersForBank).mockReturnValue([{ name: "zenrows", fetchHtml: providerFetch }]);

    const html = await fetchHtmlWithProxyFallback("https://www.combank.lk/test", "commercial_bank", directFetch);

    expect(html).toBe("<html>proxied after timeout</html>");
    expect(directFetch).toHaveBeenCalledTimes(2);
    expect(providerFetch).toHaveBeenCalledWith("https://www.combank.lk/test", expect.any(String));
  });
});

