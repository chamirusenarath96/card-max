/**
 * card-max scraper Worker (PoC — model A: GH Actions orchestrates)
 * Spec: specs/features/072-cloudflare-workers-scraping.md (AC1, AC2)
 *
 * Standalone Cloudflare Worker, deployed separately from the Next.js app and
 * the crawler (not part of the root tsconfig/eslint scope — see workers/README.md).
 *
 * POST / { url: string, render?: boolean, bank?: string } -> { html: string }
 * Auth: Authorization: Bearer <WORKER_SECRET> (required whenever WORKER_SECRET is set)
 *
 * `render: true` uses Browser Rendering (Puppeteer) for JS-heavy pages
 * (e.g. Sampath's SPA-rendered card-promotions API). Plain requests use a
 * bare `fetch()`, relying on the request originating from Cloudflare's edge
 * (a different colo/IP per request) rather than the GH Actions runner's
 * single, increasingly-blocklisted IP.
 */
export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return json({ error: "Method not allowed — POST only" }, 405);
    }

    if (env.WORKER_SECRET) {
      const auth = request.headers.get("Authorization") || "";
      if (auth !== `Bearer ${env.WORKER_SECRET}`) {
        return json({ error: "Unauthorized" }, 401);
      }
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const { url, render, bank } = body || {};
    if (typeof url !== "string" || !url) {
      return json({ error: "Missing required 'url' string field" }, 400);
    }

    try {
      const html = render ? await fetchRendered(env, url) : await fetchPlain(url);
      return json({ html, bank });
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : String(err) }, 502);
    }
  },
};

async function fetchPlain(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    },
  });
  if (!response.ok) {
    throw new Error(`Upstream HTTP ${response.status} fetching ${url}`);
  }
  return response.text();
}

/**
 * Requires the `BROWSER` Browser Rendering binding (Workers Paid plan or
 * the 10 min/day free-tier allowance — see spec 072 cost table).
 */
async function fetchRendered(env, url) {
  if (!env.BROWSER) {
    throw new Error("Browser Rendering binding 'BROWSER' not configured on this Worker");
  }
  const puppeteer = await import("@cloudflare/puppeteer");
  const browser = await puppeteer.launch(env.BROWSER);
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle0", timeout: 30_000 });
    return await page.content();
  } finally {
    await browser.close();
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
