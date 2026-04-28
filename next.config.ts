import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Bank CDNs
      { protocol: "https", hostname: "**.sampath.lk" },
      { protocol: "https", hostname: "**.combank.lk" },
      { protocol: "https", hostname: "**.hnb.lk" },
      { protocol: "https", hostname: "**.nationstrust.com" },
      // AWS S3 — ComBank and others host images here
      { protocol: "https", hostname: "s3.amazonaws.com" },
      { protocol: "https", hostname: "**.s3.amazonaws.com" },
      { protocol: "https", hostname: "**.amazonaws.com" },
      { protocol: "https", hostname: "**.cloudfront.net" },
      // AI-generated fallback images (Pollinations.ai — free, no API key)
      { protocol: "https", hostname: "image.pollinations.ai" },
      // Google favicon service (replaces deprecated Clearbit Logo API)
      { protocol: "https", hostname: "www.google.com" },
      // AmEx Sri Lanka offer images (hosted on americanexpress.lk CDN)
      { protocol: "https", hostname: "www.americanexpress.lk" },
    ],
  },
};

export default nextConfig;
