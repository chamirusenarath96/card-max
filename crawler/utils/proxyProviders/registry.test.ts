/**
 * Proxy provider registry — unit tests
 * Spec: specs/features/053-scraping-proxy-fallback.md (AC1-AC6)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getConfiguredProviders, getBankProviderMap, selectProviderForBank, orderedProvidersForBank } from "./registry";
import type { ProxyProvider } from "./types";

describe("getConfiguredProviders", () => {
  it("returns [] when WEBSCRAPINGAPI_API_KEY is not set (AC1)", () => {
    const providers = getConfiguredProviders({} as unknown as NodeJS.ProcessEnv);
    expect(providers).toEqual([]);
  });

  it("returns a single provider named 'webscrapingapi' when WEBSCRAPINGAPI_API_KEY is set (AC2)", () => {
    const providers = getConfiguredProviders({ WEBSCRAPINGAPI_API_KEY: "key2" } as unknown as NodeJS.ProcessEnv);
    expect(providers).toHaveLength(1);
    expect(providers[0]!.name).toBe("webscrapingapi");
  });

  it("returns only brightdata-unlocker when BRIGHTDATA_API_KEY+ZONE are set, ignoring the legacy WebScrapingAPI key (AC11)", () => {
    const providers = getConfiguredProviders({
      BRIGHTDATA_API_KEY: "bd-key",
      BRIGHTDATA_ZONE: "bd-zone",
      WEBSCRAPINGAPI_API_KEY: "key2",
    } as unknown as NodeJS.ProcessEnv);
    expect(providers.map((p) => p.name)).toEqual(["brightdata-unlocker"]);
  });

  it("returns brightdata-unlocker then brightdata-residential when both are configured (AC12)", () => {
    const providers = getConfiguredProviders({
      BRIGHTDATA_API_KEY: "bd-key",
      BRIGHTDATA_ZONE: "bd-zone",
      BRIGHTDATA_RESIDENTIAL_CUSTOMER_ID: "cust",
      BRIGHTDATA_RESIDENTIAL_ZONE: "resi-zone",
      BRIGHTDATA_RESIDENTIAL_PASSWORD: "pw",
    } as unknown as NodeJS.ProcessEnv);
    expect(providers.map((p) => p.name)).toEqual(["brightdata-unlocker", "brightdata-residential"]);
  });

  it("falls back to legacy WebScrapingAPI when no Bright Data vars are set (AC13)", () => {
    const providers = getConfiguredProviders({
      WEBSCRAPINGAPI_API_KEY: "key2",
    } as unknown as NodeJS.ProcessEnv);
    expect(providers.map((p) => p.name)).toEqual(["webscrapingapi"]);
  });

  it("does not configure brightdata-residential alone without the Unlocker when only residential vars are set, but still skips legacy", () => {
    const providers = getConfiguredProviders({
      BRIGHTDATA_RESIDENTIAL_CUSTOMER_ID: "cust",
      BRIGHTDATA_RESIDENTIAL_ZONE: "resi-zone",
      BRIGHTDATA_RESIDENTIAL_PASSWORD: "pw",
      WEBSCRAPINGAPI_API_KEY: "key2",
    } as unknown as NodeJS.ProcessEnv);
    expect(providers.map((p) => p.name)).toEqual(["brightdata-residential"]);
  });
});

describe("getBankProviderMap", () => {
  it("returns {} when PROXY_BANK_MAP is unset", () => {
    expect(getBankProviderMap({} as unknown as NodeJS.ProcessEnv)).toEqual({});
  });

  it("parses valid JSON from PROXY_BANK_MAP", () => {
    const map = getBankProviderMap({
      PROXY_BANK_MAP: '{"commercial_bank":"webscrapingapi"}',
    } as unknown as NodeJS.ProcessEnv);
    expect(map).toEqual({ commercial_bank: "webscrapingapi" });
  });

  it("returns {} and logs a warning (does not throw) when PROXY_BANK_MAP is invalid JSON (AC6)", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const map = getBankProviderMap({ PROXY_BANK_MAP: "{not json" } as unknown as NodeJS.ProcessEnv);
    expect(map).toEqual({});
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe("selectProviderForBank", () => {
  const webscrapingapi: ProxyProvider = { name: "webscrapingapi", fetchHtml: vi.fn() };
  const unlocker: ProxyProvider = { name: "brightdata-unlocker", fetchHtml: vi.fn() };
  const residential: ProxyProvider = { name: "brightdata-residential", fetchHtml: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when providers is [] regardless of bankMap contents (AC3)", () => {
    expect(selectProviderForBank("commercial_bank", [], { commercial_bank: "webscrapingapi" })).toBeNull();
  });

  it("returns the provider whose name matches bankMap[bank] when both an explicit mapping and multiple providers are present (AC4)", () => {
    const result = selectProviderForBank(
      "commercial_bank",
      [unlocker, webscrapingapi],
      { commercial_bank: "webscrapingapi" }
    );
    expect(result).toBe(webscrapingapi);
  });

  it("returns the same provider for the same (bank, providers) pair across repeated calls with no mapping (AC5)", () => {
    const first = selectProviderForBank("bank_of_ceylon", [unlocker, webscrapingapi]);
    const second = selectProviderForBank("bank_of_ceylon", [unlocker, webscrapingapi]);
    const third = selectProviderForBank("bank_of_ceylon", [unlocker, webscrapingapi]);
    expect(first).toBe(second);
    expect(second).toBe(third);
  });

  it("falls through to deterministic hash-based selection among legacy-only providers when bankMap names a provider that isn't configured", () => {
    const result = selectProviderForBank("commercial_bank", [webscrapingapi], { commercial_bank: "unconfigured-provider" });
    expect(result).toBe(webscrapingapi);
  });

  it("prefers the first provider (priority order) over hash distribution when a non-legacy provider is present (AC14)", () => {
    // Try several banks — priority order means it's always the first entry, never hash-distributed.
    for (const bank of ["commercial_bank", "bank_of_ceylon", "sampath_bank", "hnb"]) {
      expect(selectProviderForBank(bank, [unlocker, residential])).toBe(unlocker);
    }
  });

  it("honors an explicit PROXY_BANK_MAP pin to brightdata-residential even with the Unlocker present (AC14)", () => {
    const result = selectProviderForBank("peoples_bank", [unlocker, residential], {
      peoples_bank: "brightdata-residential",
    });
    expect(result).toBe(residential);
  });
});

describe("orderedProvidersForBank", () => {
  const webscrapingapi: ProxyProvider = { name: "webscrapingapi", fetchHtml: vi.fn() };
  const unlocker: ProxyProvider = { name: "brightdata-unlocker", fetchHtml: vi.fn() };

  it("returns [] when no providers are configured (AC3)", () => {
    expect(orderedProvidersForBank("commercial_bank", [])).toEqual([]);
  });

  it("returns the deterministic pick first, followed by the remaining configured providers (AC3)", () => {
    const result = orderedProvidersForBank("bank_of_ceylon", [unlocker, webscrapingapi], {
      bank_of_ceylon: "webscrapingapi",
    });
    expect(result).toEqual([webscrapingapi, unlocker]);
  });

  it("returns just the single configured provider when only one exists (AC4)", () => {
    const result = orderedProvidersForBank("bank_of_ceylon", [webscrapingapi]);
    expect(result).toEqual([webscrapingapi]);
  });
});
