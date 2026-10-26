#!/usr/bin/env tsx
/**
 * One-off diagnostic script — NOT part of the crawler. Manually probes the
 * Sampath Bank promotions API and the NTB listing/Incapsula page with a few
 * header/cookie/param variants, through both a direct fetch and the
 * configured Bright Data provider, and prints full raw responses so we can
 * see exactly why sampath.ts/ntb.ts are currently returning 0 offers.
 *
 * Usage: npx tsx scripts/debug-sampath-ntb.ts [--sampath] [--ntb]
 * (no flags = run both)
 *
 * Requires BRIGHTDATA_API_KEY + BRIGHTDATA_ZONE to test the proxy path.
 */
import { getConfiguredProviders } from "../crawler/utils/proxyProviders/registry";

function truncate(s: string, n = 1500): string {
  return s.length > n ? s.slice(0, n) + `…[truncated, ${s.length} total chars]` : s;
}

async function rawFetch(url: string, headers: Record<string, string>): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  const response = await fetch(url, { headers });
  const headerObj: Record<string, string> = {};
  response.headers.forEach((v, k) => { headerObj[k] = v; });
  const body = await response.text().catch(() => "<unreadable body>");
  return { status: response.status, headers: headerObj, body };
}

async function probeSampath(): Promise<void> {
  console.log("\n########## SAMPATH ##########");

  const variants: { label: string; url: string; headers: Record<string, string> }[] = [
    {
      label: "current prod params (page_number=1&size=200, Referer only)",
      url: "https://www.sampath.lk/api/card-promotions?page_number=1&size=200",
      headers: { Accept: "application/json, */*;q=0.8", Referer: "https://www.sampath.lk/sampath-cards/credit-card-offer" },
    },
    {
      label: "no query params at all",
      url: "https://www.sampath.lk/api/card-promotions",
      headers: { Accept: "application/json, */*;q=0.8", Referer: "https://www.sampath.lk/sampath-cards/credit-card-offer" },
    },
    {
      label: "small page size (size=20), matching what the site's own page likely requests",
      url: "https://www.sampath.lk/api/card-promotions?page_number=1&size=20",
      headers: { Accept: "application/json, */*;q=0.8", Referer: "https://www.sampath.lk/sampath-cards/credit-card-offer" },
    },
    {
      label: "zero-indexed page (page_number=0&size=200)",
      url: "https://www.sampath.lk/api/card-promotions?page_number=0&size=200",
      headers: { Accept: "application/json, */*;q=0.8", Referer: "https://www.sampath.lk/sampath-cards/credit-card-offer" },
    },
    {
      label: "full browser-like headers incl. Origin + Sec-Fetch-*",
      url: "https://www.sampath.lk/api/card-promotions?page_number=1&size=200",
      headers: {
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        Origin: "https://www.sampath.lk",
        Referer: "https://www.sampath.lk/sampath-cards/credit-card-offer",
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Dest": "empty",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
    },
  ];

  for (const v of variants) {
    console.log(`\n--- direct fetch: ${v.label} ---`);
    console.log(`GET ${v.url}`);
    try {
      const { status, headers, body } = await rawFetch(v.url, v.headers);
      console.log(`status=${status}`);
      console.log(`content-type=${headers["content-type"]} set-cookie=${headers["set-cookie"] ? "present" : "none"} server=${headers["server"]}`);
      console.log(`body: ${truncate(body)}`);
    } catch (err) {
      console.log(`FAILED: ${(err as Error).message}`);
    }
  }

  const providers = getConfiguredProviders();
  const unlocker = providers.find((p) => p.name === "brightdata-unlocker");
  if (unlocker) {
    for (const v of variants.slice(0, 2)) {
      console.log(`\n--- via brightdata-unlocker: ${v.label} ---`);
      try {
        const body = await unlocker.fetchHtml(v.url, "sampath_bank");
        console.log(`body: ${truncate(body)}`);
      } catch (err) {
        console.log(`FAILED: ${(err as Error).message}`);
      }
    }
  } else {
    console.log("\n(no brightdata-unlocker configured — skipping proxy variants)");
  }

  // Also fetch the HTML offer page itself to see if the promotions are
  // server-rendered / embedded as JSON in a <script> tag instead of behind
  // the API — would explain an API that legitimately returns empty.
  console.log("\n--- direct fetch: the human-facing offer page itself ---");
  try {
    const { status, body } = await rawFetch("https://www.sampath.lk/sampath-cards/credit-card-offer", {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    });
    console.log(`status=${status} length=${body.length}`);
    const scriptJsonMatch = body.match(/__NEXT_DATA__[^>]*>([\s\S]*?)<\/script>/i) ?? body.match(/window\.__[A-Z_]+__\s*=\s*(\{[\s\S]*?\});/i);
    if (scriptJsonMatch) {
      console.log(`Found an embedded data script (first 1500 chars): ${truncate(scriptJsonMatch[1] ?? scriptJsonMatch[0])}`);
    } else {
      console.log("No obvious __NEXT_DATA__/window.__*__ embedded JSON found.");
    }
    const apiRefs = [...new Set([...body.matchAll(/["'`](\/?api\/[A-Za-z0-9_\-/]+[^"'`\s]*)["'`]/g)].map((m) => m[1]))];
    console.log(`API path references in page (${apiRefs.length}): ${JSON.stringify(apiRefs.slice(0, 40))}`);
    const scriptSrcs = [...new Set([...body.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1]))];
    console.log(`Script srcs (${scriptSrcs.length}): ${JSON.stringify(scriptSrcs.slice(0, 30))}`);
    const offerIdx = body.search(/promotion|card-offer|offer-card/i);
    console.log(`First "promotion/offer" marker at char ${offerIdx}${offerIdx >= 0 ? `: ${truncate(body.slice(Math.max(0, offerIdx - 300), offerIdx + 1500), 1800)}` : ""}`);
  } catch (err) {
    console.log(`FAILED: ${(err as Error).message}`);
  }
}

async function probeNtb(): Promise<void> {
  console.log("\n########## NTB ##########");

  const listingUrl = "https://www.nationstrust.com/promotions/what-s-new";

  console.log("\n--- direct fetch: listing page ---");
  try {
    const { status, headers, body } = await rawFetch(listingUrl, {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    });
    console.log(`status=${status} length=${body.length} server=${headers["server"]} x-iinfo=${headers["x-iinfo"] ?? "none"}`);
    console.log(`Incapsula marker present: ${body.includes("Incapsula incident ID")}`);
    console.log(`body (first 1500 chars): ${truncate(body)}`);
  } catch (err) {
    console.log(`FAILED: ${(err as Error).message}`);
  }

  const providers = getConfiguredProviders();
  const unlocker = providers.find((p) => p.name === "brightdata-unlocker");
  if (unlocker) {
    console.log("\n--- via brightdata-unlocker: listing page ---");
    try {
      const body = await unlocker.fetchHtml(listingUrl, "nations_trust_bank");
      console.log(`length=${body.length}`);
      console.log(`Incapsula marker present: ${body.includes("Incapsula incident ID")}`);
      const linkMatches = [...body.matchAll(/href=["']((?:https?:\/\/(?:www\.)?nationstrust\.com)?\/promotions\/[^"'#?]{5,}\/[^"'#?]{5,})["']/gi)];
      console.log(`Campaign-link regex matches found: ${linkMatches.length}`);

      // Broader: any href containing "promotions" at all, and any fetch()/axios/api call hints
      const anyPromoHref = [...body.matchAll(/href=["']([^"']*promotions[^"']*)["']/gi)].map((m) => m[1]);
      const uniquePromoHref = [...new Set(anyPromoHref)];
      console.log(`Any href containing "promotions" (${uniquePromoHref.length} unique): ${JSON.stringify(uniquePromoHref.slice(0, 40))}`);

      const apiHints = [...body.matchAll(/(?:fetch|axios\.get|axios\.post|url:)\s*\(?["']([^"']{3,120})["']/gi)].map((m) => m[1]);
      const uniqueApiHints = [...new Set(apiHints)].filter((u) => /api|promotions|campaign/i.test(u));
      console.log(`API-call hints referencing promotions/campaign (${uniqueApiHints.length}): ${JSON.stringify(uniqueApiHints.slice(0, 20))}`);

      // Look for a Next.js/Nuxt data island regardless of exact tag shape
      const nextData = body.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
      console.log(`__NEXT_DATA__ present: ${!!nextData}${nextData ? ` (first 1000 chars: ${truncate(nextData[1] ?? "", 1000)})` : ""}`);

      // Print a mid-body slice (where the main content usually lives) instead of just the <head>
      const midStart = Math.max(0, Math.floor(body.length / 2) - 1000);
      console.log(`body mid-slice (chars ${midStart}-${midStart + 2500}): ${truncate(body.slice(midStart, midStart + 2500), 2500)}`);
    } catch (err) {
      console.log(`FAILED: ${(err as Error).message}`);
    }
  } else {
    console.log("\n(no brightdata-unlocker configured — skipping proxy variant)");
  }
}

async function main() {
  const args = process.argv.slice(2);
  const runSampath = args.includes("--sampath") || args.length === 0;
  const runNtb = args.includes("--ntb") || args.length === 0;

  const providers = getConfiguredProviders();
  console.log(`Configured providers: ${providers.map((p) => p.name).join(", ") || "(none)"}`);

  if (runSampath) await probeSampath();
  if (runNtb) await probeNtb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
