/**
 * Bright Data Web Unlocker provider — unit tests
 * Spec: specs/features/078-brightdata-web-unlocker.md (AC1-AC6)
 */
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from "vitest";
import {
  createBrightDataUnlockerProvider,
  verifyExitCountry,
  _resetGeoCheckCounter,
} from "./brightDataUnlocker";

const originalFetch = global.fetch;

function mockJsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response;
}

describe("verifyExitCountry", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });
  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("returns the lowercased country from the mygeo.json response (AC2)", async () => {
    vi.mocked(global.fetch).mockResolvedValue(mockJsonResponse({ country: "LK" }));
    const country = await verifyExitCountry("key", "zone");
    expect(country).toBe("lk");

    const [url, init] = vi.mocked(global.fetch).mock.calls[0]!;
    expect(url).toBe("https://api.brightdata.com/request");
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer key" });
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({ zone: "zone", url: "https://geo.brdtest.com/mygeo.json", format: "raw", country: "lk" });
  });

  it("throws on a non-2xx response", async () => {
    vi.mocked(global.fetch).mockResolvedValue(mockJsonResponse({}, false, 401));
    await expect(verifyExitCountry("key", "zone")).rejects.toThrow("Bright Data geo-check HTTP 401");
  });

  it("throws when the response body isn't valid JSON", async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve("not json"),
    } as Response);
    await expect(verifyExitCountry("key", "zone")).rejects.toThrow("non-JSON response");
  });
});

describe("createBrightDataUnlockerProvider", () => {
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

  it("verifies the exit country before the first fetch and proceeds when it's lk (AC1, AC2)", async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(mockJsonResponse({ country: "lk" })) // geo check
      .mockResolvedValueOnce({ ok: true, status: 200, text: () => Promise.resolve("<html>ok</html>") } as Response);

    const provider = createBrightDataUnlockerProvider("key", "zone");
    const html = await provider.fetchHtml("https://example.com");

    expect(html).toBe("<html>ok</html>");
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("throws and never issues the real request when the exit country isn't lk (AC3)", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(mockJsonResponse({ country: "us" }));

    const provider = createBrightDataUnlockerProvider("key", "zone");
    await expect(provider.fetchHtml("https://example.com")).rejects.toThrow(
      'expected "lk", got "us"'
    );
    expect(global.fetch).toHaveBeenCalledTimes(1); // geo check only, real request never sent
  });

  it("sends zone, url, format=raw and country=lk in the POST body for the real request (AC1)", async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(mockJsonResponse({ country: "lk" }))
      .mockResolvedValueOnce({ ok: true, status: 200, text: () => Promise.resolve("<html>ok</html>") } as Response);

    const provider = createBrightDataUnlockerProvider("key", "my-zone");
    await provider.fetchHtml("https://www.boc.lk/personal-banking/card-offers/dining");

    const [, init] = vi.mocked(global.fetch).mock.calls[1]!;
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({
      zone: "my-zone",
      url: "https://www.boc.lk/personal-banking/card-offers/dining",
      format: "raw",
      country: "lk",
    });
  });

  it("re-checks the exit country every 50 requests, not on every call (AC2)", async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve("ok"),
    } as Response);
    // First call's geo-check needs to resolve "lk" specifically; override call 0.
    vi.mocked(global.fetch).mockResolvedValueOnce(mockJsonResponse({ country: "lk" }));

    const provider = createBrightDataUnlockerProvider("key", "zone");
    await provider.fetchHtml("https://example.com/1"); // triggers geo check (call #0) + real fetch

    const callsAfterFirst = vi.mocked(global.fetch).mock.calls.length;
    expect(callsAfterFirst).toBe(2); // 1 geo-check + 1 real fetch

    for (let i = 0; i < 48; i++) {
      await provider.fetchHtml(`https://example.com/${i + 2}`);
    }
    // 48 more real fetches, no additional geo-checks (requestCount now at 49, not yet 50)
    expect(vi.mocked(global.fetch).mock.calls.length).toBe(2 + 48);
  });

  it("surfaces the response body in the thrown error on a non-2xx real request (AC1)", async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(mockJsonResponse({ country: "lk" }))
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: () => Promise.resolve('{"error":"blocked"}'),
      } as Response);

    const provider = createBrightDataUnlockerProvider("key", "zone");
    await expect(provider.fetchHtml("https://example.com")).rejects.toThrow(
      'Bright Data Web Unlocker HTTP 403 fetching https://example.com: {"error":"blocked"}'
    );
  });
});
