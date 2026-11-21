import type { NextConfig } from "next";

// Sent with every response. The Content Security Policy is per request (it carries a nonce) and is set
// in src/middleware.ts.
const securityHeaders = [
  // Only Nexdo's own pages may frame Nexdo (/mobile-preview does). Stops clickjacking; older browsers
  // use this header, newer ones the policy's frame-ancestors.
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  // Browsers must not guess a different content type for a response (uploaded images, JSON).
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Browsers that have reached Nexdo over https keep using https for two years.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000' },
  // Microphone (voice), camera (photos) and location (weather) work on Nexdo's pages only, not in frames from elsewhere.
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(self), payment=(), usb=()' },
];

const nextConfig: NextConfig = {
  agentRules: false,
  poweredByHeader: false,
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // Other sites learn only that a visit came from Nexdo, never the page or its query string.
      // Pages only: a header set here replaces the same header set by a route, and the OAuth routes
      // under /api send the stricter "no-referrer" because their URLs carry one-time tokens.
      { source: '/((?!api/).*)', headers: [{ key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' }] },
    ];
  },
  experimental: {
    // Railpack keeps .next/cache between Railway builds, and a corrupted Turbopack cache there failed
    // builds ("Cache corruption detected", "Failed to restore data for task"). Production builds compile
    // from scratch instead; `next dev` keeps its own cache (turbopackFileSystemCacheForDev).
    turbopackFileSystemCacheForBuild: false,
  },
};

export default nextConfig;
