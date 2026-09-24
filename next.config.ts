import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  experimental: {
    // Railpack keeps .next/cache between Railway builds, and a corrupted Turbopack cache there failed
    // builds ("Cache corruption detected", "Failed to restore data for task"). Production builds compile
    // from scratch instead; `next dev` keeps its own cache (turbopackFileSystemCacheForDev).
    turbopackFileSystemCacheForBuild: false,
  },
};

export default nextConfig;
