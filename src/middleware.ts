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
