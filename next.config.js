/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  output: 'standalone',
  poweredByHeader: false,
  // Never ship source maps to browsers in production — they expose the full
  // application source to anyone with DevTools open.
  productionBrowserSourceMaps: false,
  experimental: {
    // Enables instrumentation.ts (register hook) — used to pin outbound
    // networking to IPv4 at server startup. Stable in Next 15; behind this
    // flag in 14.2.
    instrumentationHook: true,
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  webpack: (config, { isServer }) => {
    config.externals = [...(config.externals || []), '@mapbox/node-pre-gyp'];
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }
    return config;
  },
};
module.exports = nextConfig;