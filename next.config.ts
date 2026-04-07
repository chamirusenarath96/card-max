import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Sampath Bank CDN
      { protocol: "https", hostname: "**.sampath.lk" },
      // Commercial Bank CDN
      { protocol: "https", hostname: "**.combank.lk" },
      // HNB CDN
      { protocol: "https", hostname: "**.hnb.lk" },
      // Nations Trust Bank CDN
      { protocol: "https", hostname: "**.nationstrust.com" },
      // AWS S3 (bank promo images)
      { protocol: "https", hostname: "**.amazonaws.com" },
      // Generic CDN fallbacks
      { protocol: "https", hostname: "**.cloudfront.net" },
      { protocol: "https", hostname: "**.s3.amazonaws.com" },
    ],
  },
};

export default nextConfig;
