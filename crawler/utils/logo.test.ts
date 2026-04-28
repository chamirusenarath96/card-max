import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  resolveMerchantDomain,
  buildClearbitUrl,
  resolveMerchantImage,
  resetBrandfetchCounter,
  getBrandfetchCallCount,
} from "./logo";

// Mock global fetch — prevents real network calls in unit tests
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function makeHeadResponse(ok: boolean) {
  return Promise.resolve({ ok, status: ok ? 200 : 404 } as Response);
}

beforeEach(() => {
  vi.clearAllMocks();
  resetBrandfetchCounter();
  // Default: all HEAD checks fail (no real network)
  mockFetch.mockResolvedValue({ ok: false, status: 404 } as Response);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ── AC1: Known merchant resolves via curated map ────────────────────────────

describe("resolveMerchantDomain — curated map", () => {
  it("resolves exact match for known Sri Lankan merchant", () => {
    expect(resolveMerchantDomain("Keells")).toBe("keells.com");
    expect(resolveMerchantDomain("KFC")).toBe("kfc.com");
    expect(resolveMerchantDomain("Pizza Hut")).toBe("pizzahut.com");
  });

  it("resolves case-insensitively (normalises name)", () => {
    expect(resolveMerchantDomain("KEELLS SUPER")).toBe("keells.com");
    expect(resolveMerchantDomain("cargills food city")).toBe("cargillsceylon.com");
  });

  it("resolves partial match for merchant with location suffix", () => {
    // "Keells Super Nugegoda" → normalises to "keellssupernugegoda" → starts with "keells"
    expect(resolveMerchantDomain("Keells Super Nugegoda")).toBe("keells.com");
  });

  it("resolves McDonald's with special characters stripped", () => {
    expect(resolveMerchantDomain("McDonald's")).toBe("mcdonalds.com");
  });

  it("falls back to guessed domain for unknown merchant", () => {
    const domain = resolveMerchantDomain("Unknown Merchant XYZ");
    expect(domain).toBe("unknownmerchantxyz.com");
  });
});

describe("buildClearbitUrl", () => {
  it("builds a Google favicon URL from a known merchant", () => {
    expect(buildClearbitUrl("Keells")).toBe(
      "https://www.google.com/s2/favicons?domain=keells.com&sz=128"
    );
  });
});

// ── AC2: Clearbit failure triggers Brandfetch call ───────────────────────────

describe("resolveMerchantImage — Brandfetch fallback (AC2)", () => {
  it("calls Brandfetch when Clearbit HEAD returns non-2xx", async () => {
    vi.stubEnv("BRANDFETCH_API_KEY", "test-api-key");

    // Clearbit HEAD fails, Brandfetch succeeds
    mockFetch.mockImplementation((url: string, opts?: RequestInit) => {
      if ((opts as RequestInit & { method?: string })?.method === "HEAD") {
        return makeHeadResponse(false);
      }
      // Brandfetch API call
      if (String(url).includes("brandfetch.io")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              logos: [{ formats: [{ src: "https://cdn.brandfetch.io/keells.png" }] }],
            }),
        } as Response);
      }
      return makeHeadResponse(false);
    });

    const result = await resolveMerchantImage(undefined, "Keells");
    expect(result).toBe("https://cdn.brandfetch.io/keells.png");

    // Verify Brandfetch was actually called
    const brandfetchCall = mockFetch.mock.calls.find(([url]) =>
      String(url).includes("brandfetch.io"),
    );
    expect(brandfetchCall).toBeDefined();
  });

  it("skips Brandfetch when BRANDFETCH_API_KEY is not set", async () => {
    vi.unstubAllEnvs();
    delete process.env.BRANDFETCH_API_KEY;

    const result = await resolveMerchantImage(undefined, "Keells");
    expect(result).toBeUndefined();

    const brandfetchCall = mockFetch.mock.calls.find(([url]) =>
      String(url).includes("brandfetch.io"),
    );
    expect(brandfetchCall).toBeUndefined();
  });
});

// ── AC3: 41st Brandfetch call skipped ────────────────────────────────────────

describe("Brandfetch rate limiting (AC3)", () => {
  it("skips the 41st Brandfetch call and returns undefined", async () => {
    vi.stubEnv("BRANDFETCH_API_KEY", "test-api-key");

    // Make Clearbit always fail and Brandfetch always return empty logos
    mockFetch.mockImplementation((url: string, opts?: RequestInit) => {
      if ((opts as RequestInit & { method?: string })?.method === "HEAD") {
        return makeHeadResponse(false);
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ logos: [] }),
      } as Response);
    });

    // Drive counter to 40
    for (let i = 0; i < 40; i++) {
      await resolveMerchantImage(undefined, `merchant-${i}`);
    }
    expect(getBrandfetchCallCount()).toBe(40);

    // The 41st attempt: Brandfetch must NOT be called
    const brandfetchCallsBefore = mockFetch.mock.calls.filter(([url]) =>
      String(url).includes("brandfetch.io"),
    ).length;

    const result = await resolveMerchantImage(undefined, "merchant-41");
    expect(result).toBeUndefined();

    const brandfetchCallsAfter = mockFetch.mock.calls.filter(([url]) =>
      String(url).includes("brandfetch.io"),
    ).length;
    expect(brandfetchCallsAfter).toBe(brandfetchCallsBefore); // no new Brandfetch call
  });
});

// ── AC4: resolveMerchantImage returns Brandfetch URL ─────────────────────────

describe("resolveMerchantImage returns Brandfetch URL (AC4)", () => {
  it("returns the URL from the first Brandfetch logo format", async () => {
    vi.stubEnv("BRANDFETCH_API_KEY", "test-api-key");

    mockFetch.mockImplementation((url: string, opts?: RequestInit) => {
      if ((opts as RequestInit & { method?: string })?.method === "HEAD") {
        return makeHeadResponse(false);
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            logos: [
              {
                formats: [
                  { src: "https://cdn.brandfetch.io/logo.png", width: 200, height: 200 },
                ],
              },
            ],
          }),
      } as Response);
    });

    const result = await resolveMerchantImage(undefined, "Keells");
    expect(result).toBe("https://cdn.brandfetch.io/logo.png");
  });

  it("returns undefined when Brandfetch response has no logos", async () => {
    vi.stubEnv("BRANDFETCH_API_KEY", "test-api-key");

    mockFetch.mockImplementation((url: string, opts?: RequestInit) => {
      if ((opts as RequestInit & { method?: string })?.method === "HEAD") {
        return makeHeadResponse(false);
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ logos: [] }),
      } as Response);
    });

    const result = await resolveMerchantImage(undefined, "Unknown Brand");
    expect(result).toBeUndefined();
  });
});

// ── AC5: Merchant with existing logo skips all API calls ─────────────────────

describe("resolveMerchantImage — existing logo (AC5)", () => {
  it("returns existingUrl immediately without any fetch calls", async () => {
    const existingUrl = "https://example.com/existing-logo.png";

    const result = await resolveMerchantImage(existingUrl, "Keells");

    expect(result).toBe(existingUrl);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("proceeds with resolution when existingUrl is undefined", async () => {
    vi.stubEnv("BRANDFETCH_API_KEY", "test-api-key");

    mockFetch.mockImplementation((url: string, opts?: RequestInit) => {
      if ((opts as RequestInit & { method?: string })?.method === "HEAD") {
        return makeHeadResponse(true); // Clearbit succeeds
      }
      return makeHeadResponse(false);
    });

    const result = await resolveMerchantImage(undefined, "Keells");
    // Google favicon should succeed and be returned
    expect(result).toBe("https://www.google.com/s2/favicons?domain=keells.com&sz=128");
    expect(mockFetch).toHaveBeenCalled();
  });
});
