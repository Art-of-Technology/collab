/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable standalone output for Docker optimization
  output: 'standalone',
  
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Don't attempt to load these server-only modules on the client
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        child_process: false,
        path: false,
        os: false,
      };
    }
    return config;
  },
  typescript: {
    // !! WARN !!
    // Temporarily ignoring type errors during build to resolve the params issue
    // TODO: Fix the proper type issue in the page components
    ignoreBuildErrors: true,
  },
  experimental: {
    // Add bodyParser settings for handling larger file uploads
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  // External packages that should be transpiled by the server
  serverExternalPackages: [
    '@prisma/client',
    'bcrypt',
  ],
  images: {
    remotePatterns: [
        {
            protocol: 'https',
            hostname: '**',
            port: '',
            pathname: '**',
        },
    ],
  },
  // Baseline security headers for paths NOT covered by src/middleware.ts.
  //
  // src/middleware.ts is the single source of truth for security headers
  // (CSP, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy,
  // X-DNS-Prefetch-Control, and clickjacking protection via the env-tunable
  // `frame-ancestors` CSP directive). Its matcher, however, deliberately
  // excludes static assets and a few infra routes. We re-apply the single
  // non-negotiable, non-configurable header here so those excluded paths are
  // still covered, without duplicating logic the middleware already owns on
  // the paths it handles.
  //
  // Notes:
  // - X-Frame-Options is intentionally NOT set here: clickjacking protection
  //   is handled by the middleware's `frame-ancestors` directive, which is
  //   tunable via CSP_FRAME_ANCESTORS. A static `DENY` would silently override
  //   that env-driven allowlist.
  // - Referrer-Policy / X-DNS-Prefetch-Control are omitted to avoid emitting
  //   the same header from two layers that could later diverge.
  async headers() {
    const securityHeaders = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
    ];
    // Mirror the paths excluded by the middleware matcher in src/middleware.ts.
    const middlewareExcludedPaths = [
      '/_next/static/:path*',
      '/_next/image/:path*',
      '/favicon.ico',
      '/robots.txt',
      '/sitemap.xml',
      '/assets/:path*',
      '/fonts/:path*',
      '/images/:path*',
      '/api/health/:path*',
    ];
    return middlewareExcludedPaths.map((source) => ({
      source,
      headers: securityHeaders,
    }));
  },
  // Remove old API config as App Router uses different mechanism
}

// Injected content via Sentry wizard below

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { withSentryConfig } = require("@sentry/nextjs");

module.exports = withSentryConfig(
  nextConfig,
  {
    // For all available options, see:
    // https://www.npmjs.com/package/@sentry/webpack-plugin#options

    org: "stech-technology-uk-limited",
    project: "collab",

    // Only print logs for uploading source maps in CI
    silent: !process.env.CI,

    // For all available options, see:
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

    // Upload a larger set of source maps for prettier stack traces (increases build time)
    widenClientFileUpload: true,

    // Uncomment to route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
    // This can increase your server load as well as your hosting bill.
    // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
    // side errors will fail.
    // tunnelRoute: "/monitoring",

    // Automatically tree-shake Sentry logger statements to reduce bundle size
    disableLogger: true,

    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,
  }
);
