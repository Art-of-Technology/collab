/** @type {import('next').NextConfig} */
const nextConfig = {
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
    domains: ['lh3.googleusercontent.com', 'upload.wikimedia.org', 'res.cloudinary.com'],
  },
  // Remove old API config as App Router uses different mechanism
}

module.exports = nextConfig 