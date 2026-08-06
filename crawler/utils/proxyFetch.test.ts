/**
 * fetchHtmlWithProxyFallback — unit tests
 * Spec: specs/features/053-scraping-proxy-fallback.md (AC7-AC10)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./proxyProviders/registry", () => ({
  getConfiguredProviders: vi.fn(),
  getBankProviderMap: vi.fn(),
  selectProviderForBank: vi.fn(),
}));

import { fetchHtmlWithProxyFallback } from "./proxyFetch";
import { getConfiguredProviders, getBankProviderMap, selectProviderForBank } from "./proxyProviders/registry";

describe("fetchHtmlWithProxyFallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the direct fetch's result and never calls getConfiguredProviders/any provider when the direct fetch resolves (AC7)", async () => {
    const directFetch = vi.fn().mockResolvedValue("<html>direct</html>");

    const html = await fetchHtmlWithProxyFallback("https://example.com", "commercial_bank", directFetch);

    expect(html).toBe("<html>direct</html>");
    expect(getConfiguredProviders).not.toHaveBeenCalled();
    expect(selectProviderForBank).not.toHaveBeenCalled();
  });

  it("calls the bank's selected provider's fetchHtml() and returns its result when the direct fetch rejects and a provider is configured (AC8)", async () => {
    const directFetch = vi.fn().mockRejectedValue(new Error("HTTP 403"));
    const providerFetchHtml = vi.fn().mockResolvedValue("<html>proxied</html>");
    vi.mocked(getConfiguredProviders).mockReturnValue([{ name: "zenrows", fetchHtml: providerFetchHtml }]);
    vi.mocked(getBankProviderMap).mockReturnValue({});
    vi.mocked(selectProviderForBank).mockReturnValue({ name: "zenrows", fetchHtml: providerFetchHtml });

    const html = await fetchHtmlWithProxyFallback("https://example.com", "commercial_bank", directFetch);

    expect(html).toBe("<html>proxied</html>");
    expect(providerFetchHtml).toHaveBeenCalledWith("https://example.com");
  });

  it("rejects (does not swallow) when the direct fetch rejects and no provider is configured (AC9)", async () => {
    const directFetch = vi.fn().mockRejectedValue(new Error("HTTP 403"));
    vi.mocked(getConfiguredProviders).mockReturnValue([]);
    vi.mocked(getBankProviderMap).mockReturnValue({});
    vi.mocked(selectProviderForBank).mockReturnValue(null);

    await expect(
      fetchHtmlWithProxyFallback("https://example.com", "commercial_bank", directFetch)
    ).rejects.toThrow(/no proxy provider is configured/);
  });

  it("rejects with the provider's error when both the direct fetch and the selected provider's fetch reject (AC10)", async () => {
    const directFetch = vi.fn().mockRejectedValue(new Error("HTTP 403"));
    const providerError = new Error("ZenRows HTTP 500");
    const providerFetchHtml = vi.fn().mockRejectedValue(providerError);
    vi.mocked(getConfiguredProviders).mockReturnValue([{ name: "zenrows", fetchHtml: providerFetchHtml }]);
    vi.mocked(getBankProviderMap).mockReturnValue({});
    vi.mocked(selectProviderForBank).mockReturnValue({ name: "zenrows", fetchHtml: providerFetchHtml });

    await expect(
      fetchHtmlWithProxyFallback("https://example.com", "commercial_bank", directFetch)
    ).rejects.toThrow("ZenRows HTTP 500");
  });
});
