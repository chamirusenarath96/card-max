/**
 * Rate-limit-aware router across configured LLM providers: "fill first, then
 * spill" selection, per-provider cooldowns parsed from 429s, and a bounded
 * inline backoff when every provider is briefly saturated at once.
 * Spec: specs/features/057-enrichment-multi-provider-llm-strategy.md (AC3-AC11)
 */
import type { LLMProvider } from "./types";
import { ProviderRateLimitError } from "./types";
import { getConfiguredProviders } from "./registry";

type Capability = "text" | "vision";

const ROLLING_WINDOW_MS = 60_000;
const MAX_INLINE_BACKOFF_MS = 30_000;

export class ProviderRouter {
  private readonly requestLog = new Map<string, number[]>();
  private readonly cooldowns = new Map<string, number>();

  constructor(private readonly providers: LLMProvider[]) {}

  /** Provider with capability match and unexpired cooldown + headroom in the
   *  current 60s window, in registration order (fill-first-then-spill). */
  selectProvider(capability: Capability): LLMProvider | null {
    const now = Date.now();
    for (const provider of this.providers) {
      if (capability === "vision" && !provider.supportsVision) continue;
      if (this.isCoolingDown(provider.name, now)) continue;
      if (!this.hasHeadroom(provider, now)) continue;
      return provider;
    }
    return null;
  }

  markCooldown(providerName: string, untilEpochMs: number): void {
    this.cooldowns.set(providerName, untilEpochMs);
  }

  /** Rolling 60s window — one entry per call attributed to this provider. */
  recordRequest(providerName: string): void {
    const timestamps = this.requestLog.get(providerName) ?? [];
    timestamps.push(Date.now());
    this.requestLog.set(providerName, timestamps);
  }

  shortestCooldownRemainingMs(capability: Capability): number | null {
    const now = Date.now();
    let shortest: number | null = null;
    for (const provider of this.providers) {
      if (capability === "vision" && !provider.supportsVision) continue;
      const until = this.cooldowns.get(provider.name);
      if (until === undefined || until <= now) continue;
      const remaining = until - now;
      if (shortest === null || remaining < shortest) shortest = remaining;
    }
    return shortest;
  }

  private isCoolingDown(providerName: string, now: number): boolean {
    const until = this.cooldowns.get(providerName);
    return until !== undefined && until > now;
  }

  private hasHeadroom(provider: LLMProvider, now: number): boolean {
    const recent = (this.requestLog.get(provider.name) ?? []).filter(
      (t) => now - t < ROLLING_WINDOW_MS
    );
    this.requestLog.set(provider.name, recent);
    return recent.length < provider.rateLimit.requestsPerMinute;
  }
}

/** Shared for the lifetime of one `npx tsx crawler/enrichment/run.ts` process
 *  — cooldowns/window state persist across offers within a run, never across
 *  runs (Out of Scope). Requires `dotenv.config()` to have already populated
 *  process.env by the time this module is first required (run.ts does this
 *  before importing enrichOffer, and CommonJS require() runs in that order). */
export const sharedRouter = new ProviderRouter(getConfiguredProviders());

export async function generateText(router: ProviderRouter, prompt: string): Promise<string> {
  return callWithRouting(router, "text", (p) => p.generateText(prompt));
}

export async function generateFromImage(
  router: ProviderRouter,
  image: { data: string; mediaType: string },
  prompt: string
): Promise<string> {
  return callWithRouting(router, "vision", (p) => p.generateFromImage(image, prompt));
}

async function callWithRouting<T>(
  router: ProviderRouter,
  capability: Capability,
  call: (p: LLMProvider) => Promise<T>
): Promise<T> {
  for (;;) {
    const provider = router.selectProvider(capability);
    if (provider) {
      router.recordRequest(provider.name);
      try {
        return await call(provider);
      } catch (err) {
        if (err instanceof ProviderRateLimitError) {
          router.markCooldown(err.provider, Date.now() + err.retryAfterMs);
          continue; // try the next available provider immediately
        }
        throw err; // non-rate-limit error: propagate as today (enrichOffer's catch handles it)
      }
    }

    const wait = router.shortestCooldownRemainingMs(capability);
    if (wait === null) {
      throw new Error(`No ${capability}-capable provider configured or available`);
    }
    if (wait > MAX_INLINE_BACKOFF_MS) {
      throw new Error(`All ${capability} providers cooling down for ${wait}ms — deferring`);
    }
    await sleep(wait);
    // loop again — the provider that just finished cooling down is now selectable
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
