/**
 * Proxy provider registry — unit tests
 * Spec: specs/features/053-scraping-proxy-fallback.md (AC1-AC6),
 *       specs/features/060-fix-zenrows-boc-provider-errors.md (AC3)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getConfiguredProviders, getBankProviderMap, selectProviderForBank, orderedProvidersForBank } from "./registry";
import type { ProxyProvider } from "./types";

describe("getConfiguredProviders", () => {
  it("returns [] when neither ZENROWS_API_KEY nor WEBSCRAPINGAPI_API_KEY is set (AC1)", () => {
    const providers = getConfiguredProviders({} as unknown as NodeJS.ProcessEnv);
    expect(providers).toEqual([]);
  });

  it("returns a single provider named 'zenrows' when only ZENROWS_API_KEY is set (AC2)", () => {
    const providers = getConfiguredProviders({ ZENROWS_API_KEY: "key1" } as unknown as NodeJS.ProcessEnv);
    expect(providers).toHaveLength(1);
    expect(providers[0]!.name).toBe("zenrows");
  });

  it("returns both providers in a stable order when both keys are set (AC2)", () => {
    const providers = getConfiguredProviders({
      ZENROWS_API_KEY: "key1",
      WEBSCRAPINGAPI_API_KEY: "key2",
    } as unknown as NodeJS.ProcessEnv);
    expect(providers.map((p) => p.name)).toEqual(["zenrows", "webscrapingapi"]);
  });

  it("does not include a workers provider when WORKER_SCRAPE_URL is unset (072 AC5 — feature-flagged off by default)", () => {
    const providers = getConfiguredProviders({ ZENROWS_API_KEY: "key1" } as unknown as NodeJS.ProcessEnv);
    expect(providers.map((p) => p.name)).toEqual(["zenrows"]);
  });

  it("appends a 'workers' provider last when WORKER_SCRAPE_URL is set (072 AC1)", () => {
    const providers = getConfiguredProviders({
      ZENROWS_API_KEY: "key1",
      WORKER_SCRAPE_URL: "https://worker.example.dev/scrape",
      WORKER_SECRET: "shh",
    } as unknown as NodeJS.ProcessEnv);
    expect(providers.map((p) => p.name)).toEqual(["zenrows", "workers"]);
  });
});

describe("getBankProviderMap", () => {
  it("returns {} when PROXY_BANK_MAP is unset", () => {
    expect(getBankProviderMap({} as unknown as NodeJS.ProcessEnv)).toEqual({});
  });

  it("parses valid JSON from PROXY_BANK_MAP", () => {
    const map = getBankProviderMap({
      PROXY_BANK_MAP: '{"commercial_bank":"zenrows"}',
    } as unknown as NodeJS.ProcessEnv);
    expect(map).toEqual({ commercial_bank: "zenrows" });
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
  const zenrows: ProxyProvider = { name: "zenrows", fetchHtml: vi.fn() };
  const webscrapingapi: ProxyProvider = { name: "webscrapingapi", fetchHtml: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when providers is [] regardless of bankMap contents (AC3)", () => {
    expect(selectProviderForBank("commercial_bank", [], { commercial_bank: "zenrows" })).toBeNull();
  });

  it("returns the provider whose name matches bankMap[bank] when both an explicit mapping and multiple providers are present (AC4)", () => {
    const result = selectProviderForBank(
      "commercial_bank",
      [zenrows, webscrapingapi],
      { commercial_bank: "webscrapingapi" }
    );
    expect(result).toBe(webscrapingapi);
  });

  it("returns the same provider for the same (bank, providers) pair across repeated calls with no mapping (AC5)", () => {
    const first = selectProviderForBank("bank_of_ceylon", [zenrows, webscrapingapi]);
    const second = selectProviderForBank("bank_of_ceylon", [zenrows, webscrapingapi]);
    const third = selectProviderForBank("bank_of_ceylon", [zenrows, webscrapingapi]);
    expect(first).toBe(second);
    expect(second).toBe(third);
  });

  it("falls through to deterministic hash-based selection when bankMap names a provider that isn't configured", () => {
    const result = selectProviderForBank("commercial_bank", [zenrows], { commercial_bank: "webscrapingapi" });
    expect(result).toBe(zenrows);
  });
});

describe("orderedProvidersForBank", () => {
  const zenrows: ProxyProvider = { name: "zenrows", fetchHtml: vi.fn() };
  const webscrapingapi: ProxyProvider = { name: "webscrapingapi", fetchHtml: vi.fn() };

  it("returns [] when no providers are configured (AC3)", () => {
    expect(orderedProvidersForBank("commercial_bank", [])).toEqual([]);
  });

  it("returns the deterministic pick first, followed by the remaining configured providers (AC3)", () => {
    const result = orderedProvidersForBank("bank_of_ceylon", [zenrows, webscrapingapi], {
      bank_of_ceylon: "webscrapingapi",
    });
    expect(result).toEqual([webscrapingapi, zenrows]);
  });

  it("returns just the single configured provider when only one exists (AC4)", () => {
    const result = orderedProvidersForBank("bank_of_ceylon", [zenrows]);
    expect(result).toEqual([zenrows]);
  });
});
