/**
 * Bright Data Residential provider — unit tests
 * Spec: specs/features/078-brightdata-web-unlocker.md (AC7-AC10)
 */
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from "vitest";
import {
  createBrightDataResidentialProvider,
  verifyResidentialSession,
  _resetGeoCheckCounter,
  type BrightDataResidentialConfig,
} from "./brightDataResidential";

const originalFetch = global.fetch;

const CONFIG: BrightDataResidentialConfig = {
  customerId: "cust123",
  zone: "resi_zone",
  password: "secret",
};

function mockJsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response;
}

describe("verifyResidentialSession", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("fetches mygeo.json through a proxy dispatcher and returns the lowercased country (AC8)", async () => {
    vi.mocked(global.fetch).mockResolvedValue(mockJsonResponse({ country: "LK" }));

    const country = await verifyResidentialSession(CONFIG, "session1");

    expect(country).toBe("lk");
    const [url, init] = vi.mocked(global.fetch).mock.calls[0]!;
    expect(url).toBe("https://geo.brdtest.com/mygeo.json");
    expect((init as { dispatcher?: unknown }).dispatcher).toBeDefined();
  });

  it("throws on a non-2xx response", async () => {
    vi.mocked(global.fetch).mockResolvedValue(mockJsonResponse({}, false, 407));
    await expect(verifyResidentialSession(CONFIG, "session1")).rejects.toThrow(
      "Bright Data residential geo-check HTTP 407"
    );
  });
});

describe("createBrightDataResidentialProvider", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
    _resetGeoCheckCounter();
  });
  afterEach(() => {
    _resetGeoCheckCounter();
    vi.restoreAllMocks();
  });
  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("verifies the exit country before the first fetch and proceeds when it's lk (AC7, AC8)", async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(mockJsonResponse({ country: "lk" }))
      .mockResolvedValueOnce({ ok: true, status: 200, text: () => Promise.resolve("<html>ok</html>") } as Response);

    const provider = createBrightDataResidentialProvider(CONFIG);
    const html = await provider.fetchHtml("https://example.com");

    expect(html).toBe("<html>ok</html>");
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("throws and never issues the real request when the exit country isn't lk (AC9)", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(mockJsonResponse({ country: "in" }));

    const provider = createBrightDataResidentialProvider(CONFIG);
    await expect(provider.fetchHtml("https://example.com")).rejects.toThrow(
      'expected "lk", got "in"'
    );
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("reuses the same sticky session across repeated calls on one provider instance (AC10)", async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve("ok"),
    } as Response);
    vi.mocked(global.fetch).mockResolvedValueOnce(mockJsonResponse({ country: "lk" }));

    const provider = createBrightDataResidentialProvider(CONFIG);
    await provider.fetchHtml("https://example.com/1");
    await provider.fetchHtml("https://example.com/2");

    // Two different provider instances get two different sessions.
    const providerTwo = createBrightDataResidentialProvider(CONFIG);
    expect(providerTwo).not.toBe(provider);
  });

  it("rejects on a non-2xx real request", async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(mockJsonResponse({ country: "lk" }))
      .mockResolvedValueOnce({ ok: false, status: 403, text: () => Promise.resolve("") } as Response);

    const provider = createBrightDataResidentialProvider(CONFIG);
    await expect(provider.fetchHtml("https://example.com")).rejects.toThrow(
      "Bright Data residential HTTP 403 fetching https://example.com"
    );
  });
});
