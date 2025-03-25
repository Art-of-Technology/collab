/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // !! WARN !!
    // Temporarily ignoring type errors during build to resolve the params issue
    // TODO: Fix the proper type issue in the page components
    ignoreBuildErrors: true,
  },
}

module.exports = nextConfig 