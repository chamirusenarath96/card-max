/**
 * Shared HTTP utilities for scrapers
 */

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const DEFAULT_HEADERS = {
  "User-Agent": DEFAULT_USER_AGENT,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
};

const JSON_HEADERS = {
  "User-Agent": DEFAULT_USER_AGENT,
  Accept: "application/json, */*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
};

/**
 * Fetch HTML from a URL with browser-like headers.
 * Adds a small delay to be polite to servers.
 */
export async function fetchHtml(
  url: string,
  delayMs = 1500
): Promise<string> {
  await sleep(delayMs);

  const response = await fetch(url, {
    headers: DEFAULT_HEADERS,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${url}`);
  }

  return response.text();
}

/**
 * Fetch HTML with extra browser headers (Referer, cookies) for sites
 * that use bot-detection (e.g. Incapsula / Imperva).
 * Pass a cookieJar map that is populated with Set-Cookie values from each
 * response so subsequent calls reuse the session cookie.
 */
export async function fetchHtmlSessioned(
  url: string,
  cookieJar: Map<string, string>,
  referer?: string,
  delayMs = 1500
): Promise<string> {
  await sleep(delayMs);

  const cookieHeader = [...cookieJar.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");

  const headers: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    Connection: "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": referer ? "same-origin" : "none",
    "Sec-Fetch-User": "?1",
    ...(referer ? { Referer: referer } : {}),
    ...(cookieHeader ? { Cookie: cookieHeader } : {}),
  };

  const response = await fetch(url, { headers });

  // Capture any Set-Cookie headers to maintain session
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) {
    for (const part of setCookie.split(",")) {
      const [pair] = part.trim().split(";");
      const eqIdx = pair?.indexOf("=") ?? -1;
      if (eqIdx > 0) {
        cookieJar.set(pair.slice(0, eqIdx).trim(), pair.slice(eqIdx + 1).trim());
      }
    }
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${url}`);
  }

  return response.text();
}

/**
 * Fetch JSON from a URL with optional retry on transient errors (503/429).
 */
export async function fetchJson<T>(
  url: string,
  delayMs = 1000,
  retries = 2
): Promise<T> {
  await sleep(delayMs);

  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await fetch(url, { headers: JSON_HEADERS });

    if (response.ok) {
      return response.json() as Promise<T>;
    }

    // Retry on transient server errors
    if ((response.status === 503 || response.status === 429) && attempt < retries) {
      const backoff = 3000 * (attempt + 1);
      console.warn(`[http] ${response.status} on ${url}, retrying in ${backoff}ms…`);
      await sleep(backoff);
      continue;
    }

    throw new Error(`HTTP ${response.status} fetching ${url}`);
  }

  throw new Error(`All retries exhausted for ${url}`);
}

/**
 * Run async tasks with a concurrency limit.
 */
export async function pLimit<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number
): Promise<T[]> {
  const results: T[] = [];
  let index = 0;

  async function runNext(): Promise<void> {
    const i = index++;
    if (i >= tasks.length) return;
    results[i] = await tasks[i]();
    await runNext();
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, runNext);
  await Promise.all(workers);
  return results;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
