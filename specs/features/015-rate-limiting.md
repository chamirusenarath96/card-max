# Feature: API Rate Limiting (015)

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [ ] Implementation started
- [ ] Tests written
- [ ] Done

## Purpose
Protect public API routes from abuse and unintentional hammering by applying per-IP
rate limits at the Edge, before requests reach application logic. Uses Upstash Redis
(free tier, 10k commands/day) with a sliding window algorithm via `@upstash/ratelimit`.

> **Note:** This feature explicitly uses Upstash Redis — NOT Vercel KV, which was
> deprecated in early 2025 and is no longer recommended.

## User Story
As the site owner, I want API requests throttled by IP so that a single client cannot
overwhelm the server or exhaust the MongoDB Atlas free-tier connection pool.

## Scope

### In Scope
- `src/middleware.ts` — Next.js Edge Runtime middleware that enforces rate limits
- Rate limiting on `/api/offers` (60 req/min per IP) and `/api/search` (20 req/min per IP)
- `429 Too Many Requests` response with `Retry-After` header when limit exceeded
- `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` headers on every response
- Graceful degradation: if Upstash is unreachable, allow the request through (fail open)
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` environment variables

### Out of Scope
- Rate limiting non-API routes (pages, static assets)
- Per-user (authenticated) rate limits (no auth system yet)
- Admin bypass / allowlisting specific IPs
- Vercel KV (deprecated — do not use)
- Header bidding or custom rate limit dashboards

## Data Contract
No database changes. Rate limit counters stored in Upstash Redis with TTL equal to
the window duration. Keys are namespaced: `rl:{route}:{ip}`.

## API Contract

### Quota Table

| Route | Limit | Window | Algorithm |
|-------|-------|--------|-----------|
| `GET /api/offers` | 60 requests | 60 seconds | Sliding window |
| `GET /api/search` | 20 requests | 60 seconds | Sliding window |
| All other `/api/*` | unlimited | — | — |

### Response Headers (all rate-limited routes)
```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 47
X-RateLimit-Reset: 1700000060
Retry-After: 23        ← only on 429 responses
```

### 429 Response Body
```json
{
  "error": "Too many requests",
  "retryAfter": 23
}
```

## Technical Approach

### Installation
```bash
npm install @upstash/ratelimit @upstash/redis
```

### Middleware (`src/middleware.ts`)
```typescript
import { NextRequest, NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const limiters: Record<string, Ratelimit> = {
  "/api/offers": new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(60, "60 s"),
    prefix: "rl:offers",
  }),
  "/api/search": new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(20, "60 s"),
    prefix: "rl:search",
  }),
};

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const limiter = limiters[path];

  if (!limiter) return NextResponse.next();

  // Real IP: Vercel sets x-forwarded-for; fallback to "anonymous"
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "anonymous";

  try {
    const { success, limit, remaining, reset } = await limiter.limit(ip);

    const headers = new Headers();
    headers.set("X-RateLimit-Limit", String(limit));
    headers.set("X-RateLimit-Remaining", String(remaining));
    headers.set("X-RateLimit-Reset", String(reset));

    if (!success) {
      const retryAfter = Math.ceil((reset - Date.now()) / 1000);
      headers.set("Retry-After", String(retryAfter));
      return NextResponse.json(
        { error: "Too many requests", retryAfter },
        { status: 429, headers }
      );
    }

    const response = NextResponse.next();
    headers.forEach((v, k) => response.headers.set(k, v));
    return response;
  } catch {
    // Upstash unreachable — fail open, allow the request
    console.warn("[middleware] Rate limit check failed — allowing request");
    return NextResponse.next();
  }
}

export const config = {
  matcher: ["/api/offers", "/api/search"],
};
```

### Environment Variables
```
UPSTASH_REDIS_REST_URL=https://your-db.upstash.io
UPSTASH_REDIS_REST_TOKEN=AXXXXXXXxxxxxxxx
```

Both are required in production. In local dev, omit them to skip rate limiting
(graceful degradation catches the missing env error).

### Upstash Free Tier
- 10,000 commands/day — each rate limit check = 2 commands (GET + INCR)
- At 5,000 API requests/day: ~10,000 commands → exactly at limit (monitor usage)
- Paid tier ($0.20 per 100k commands) if traffic grows

## Acceptance Criteria
- [ ] AC1: `src/middleware.ts` created, exported from Next.js project root
- [ ] AC2: `GET /api/offers` rate limited to 60 req/60s per IP (sliding window)
- [ ] AC3: `GET /api/search` rate limited to 20 req/60s per IP (sliding window)
- [ ] AC4: 61st request within 60s receives `429` with `Retry-After` header
- [ ] AC5: All responses include `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` headers
- [ ] AC6: Upstash unavailable → requests pass through (fail open, warning logged)
- [ ] AC7: `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` documented in `.env.example`
- [ ] AC8: Rate limiting does not apply to page routes or static assets

## Test Cases

| Test | Type | AC |
|------|------|----|
| 61st request to /api/offers returns 429 | integration | AC2, AC4 |
| 21st request to /api/search returns 429 | integration | AC3, AC4 |
| Response includes X-RateLimit-* headers | integration | AC5 |
| Missing Upstash env — request passes through | unit | AC6 |
| Page route not matched by middleware | unit | AC8 |

## Edge Cases
- IPv6 addresses in `x-forwarded-for` — handled correctly by string split + trim
- Request behind multiple proxies — use first IP in `x-forwarded-for` chain
- Clock skew between Edge runtime and Redis — sliding window handles this; `reset` timestamp may be approximate
- Upstash REST token rotated — update secret, middleware resumes automatically
- `NEXT_PUBLIC_*` prefix not needed — these are server-only secrets (middleware runs server-side)

## Notes
- Use `Ratelimit.slidingWindow()` not `fixedWindow()` — sliding window prevents burst attacks at window boundaries
- Upstash free tier signup: https://upstash.com — create a Redis database, copy REST URL and token
- `@upstash/ratelimit` v2+ required for Next.js 14+ App Router Edge compatibility
- The middleware `matcher` must list exact paths — wildcard patterns like `/api/:path*` require a different matcher syntax
- Do NOT use Vercel KV: it was deprecated in early 2025 and projects using it were migrated to Upstash under the hood anyway
