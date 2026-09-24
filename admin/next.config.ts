import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  // This app lives inside the backend's repository. Pin the roots so Next never treats the parent
  // directory (with its own lockfile) as the workspace root when tracing or bundling.
  outputFileTracingRoot: __dirname,
  turbopack: { root: __dirname },
  experimental: {
    // Same Railpack cache issue as the backend: compile production builds from scratch.
    turbopackFileSystemCacheForBuild: false,
  },
  poweredByHeader: false,
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "same-origin" },
        { key: "X-Robots-Tag", value: "noindex, nofollow" },
      ],
    }];
  },
};

export default nextConfig;
